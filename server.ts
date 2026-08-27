import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { requireAuth, optionalAuth, AuthRequest } from './src/middleware/auth.ts';
import { getOrCreateUser } from './src/db/users.ts';
import {
  isS3Configured,
  uploadBufferToS3,
  deleteFromS3,
  generatePresignedUploadUrl,
  getS3Config,
} from './src/lib/s3.ts';
import {
  fetchFullLibrary,
  createPreset,
  updatePreset,
  deletePreset,
  createSample,
  deleteSample,
  createKit,
  linkSamplesToKit,
  renameItem,
  createFeedback,
  getAllFeedback,
} from './src/db/queries.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Ensure storage directories exist
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Multer disk storage for audio assets
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
      const cleanName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      cb(null, `${uniqueSuffix}_${cleanName}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  });

  // Middlewares
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Static serving for uploaded files
  app.use('/uploads', express.static(uploadsDir));
  app.use('/api/storage', express.static(uploadsDir));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Neon Auth Proxy Route (for direct first-party session/auth calls)
  app.all('/api/neon-auth/*all', async (req: Request, res: Response) => {
    try {
      const targetPath = req.url.replace('/api/neon-auth', '');
      const neonUrl = `https://ep-restless-surf-axxduerp.neonauth.c-4.us-east-2.aws.neon.tech/Career2Canvas/auth${targetPath}`;

      const headers: Record<string, string> = {};
      if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'] as string;
      if (req.headers['authorization']) headers['authorization'] = req.headers['authorization'] as string;
      if (req.headers['cookie']) headers['cookie'] = req.headers['cookie'] as string;
      headers['origin'] = `${req.protocol}://${req.get('host')}`;

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(neonUrl, fetchOptions);
      const contentType = response.headers.get('content-type') || 'application/json';
      res.status(response.status);
      res.set('content-type', contentType);

      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        res.set('set-cookie', setCookie);
      }

      const text = await response.text();
      res.send(text);
    } catch (err: any) {
      console.error('Neon auth proxy error:', err);
      res.status(500).json({ error: err.message || 'Auth proxy failed' });
    }
  });

  // OAuth Popup Callback Route
  app.get('/auth/callback', (_req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Successful</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; background: #0c0f17; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .box { text-align: center; padding: 2rem; background: #151a24; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); max-width: 380px; width: 90%; }
            .spinner { width: 28px; height: 28px; border: 2.5px solid rgba(0,246,255,0.2); border-top-color: #00f6ff; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 12px auto; }
            @keyframes spin { to { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="box">
            <h2 style="color:#00f6ff; margin:0 0 8px; font-size: 18px;">Authentication Successful</h2>
            <div class="spinner"></div>
            <p id="msg" style="color:#aaa; font-size:13px; margin: 0;">Connecting to Beat Slicer...</p>
          </div>
          <script>
            (async function() {
              const NEON_AUTH_URL = "https://ep-restless-surf-axxduerp.neonauth.c-4.us-east-2.aws.neon.tech/Career2Canvas/auth";
              const urlParams = new URLSearchParams(window.location.search);
              let token = urlParams.get('token') || urlParams.get('session_token') || urlParams.get('access_token') || null;
              let user = null;
              let session = null;

              // Helper: Extract user from JWT token if available
              function parseJwt(tokenStr) {
                try {
                  const base64Url = tokenStr.split('.')[1];
                  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                  const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                  }).join(''));
                  return JSON.parse(jsonPayload);
                } catch(e) {
                  return null;
                }
              }

              // Step 1: Check if token itself contains JWT user profile
              if (token) {
                const jwtData = parseJwt(token);
                if (jwtData && (jwtData.sub || jwtData.email || jwtData.id)) {
                  user = {
                    id: jwtData.sub || jwtData.id || jwtData.userId,
                    uid: jwtData.sub || jwtData.id || jwtData.userId,
                    email: jwtData.email || 'user@example.com',
                    name: jwtData.name || (jwtData.email ? jwtData.email.split('@')[0] : 'User'),
                    image: jwtData.picture || jwtData.image,
                  };
                }
              }

              // Step 2: Fetch session from Neon Auth with credentials directly in this top-level window
              try {
                const res = await fetch(NEON_AUTH_URL + '/get-session', {
                  method: 'GET',
                  credentials: 'include',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': 'Bearer ' + token } : {})
                  }
                });
                if (res.ok) {
                  const data = await res.json();
                  if (data && data.user) {
                    user = data.user;
                    session = data.session;
                    token = data.session?.token || data.session?.id || token || data.token;
                  }
                }
              } catch (e) {
                console.warn('Direct Neon session fetch issue in popup:', e);
              }

              // Step 3: Fallback via local backend proxy
              if (!user) {
                try {
                  const proxyRes = await fetch('/api/neon-auth/get-session', {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(token ? { 'Authorization': 'Bearer ' + token } : {})
                    }
                  });
                  if (proxyRes.ok) {
                    const proxyData = await proxyRes.json();
                    if (proxyData && proxyData.user) {
                      user = proxyData.user;
                      session = proxyData.session;
                      token = proxyData.session?.token || proxyData.session?.id || token || proxyData.token;
                    }
                  }
                } catch (e) {
                  console.warn('Proxy Neon session fetch issue in popup:', e);
                }
              }

              // Step 4: Fallback from URL params or local fallback if user is still null
              if (!user) {
                const paramEmail = urlParams.get('email') || urlParams.get('user_email');
                const paramName = urlParams.get('name') || urlParams.get('username') || (paramEmail ? paramEmail.split('@')[0] : null);
                const paramId = urlParams.get('uid') || urlParams.get('user_id') || urlParams.get('id');

                if (paramEmail || paramId || token) {
                  const fallbackId = paramId || (token ? 'neon_' + token.substring(0, 16) : 'user_' + Date.now());
                  const fallbackEmail = paramEmail || (fallbackId + '@neon.auth');
                  user = {
                    id: fallbackId,
                    uid: fallbackId,
                    email: fallbackEmail,
                    name: paramName || fallbackEmail.split('@')[0] || 'User'
                  };
                  if (!token) token = fallbackId;
                }
              }

              // Step 5: Persist in local storage
              if (token) localStorage.setItem('neon_auth_token', token);
              if (user) localStorage.setItem('neon_auth_user', JSON.stringify(user));

              const payload = {
                type: 'OAUTH_AUTH_SUCCESS',
                token: token || (user ? user.id : null),
                user: user || null,
                session: session || null,
                origin: window.location.origin,
                timestamp: Date.now()
              };

              // Step 6: Broadcast across channels
              try {
                if (window.opener) {
                  window.opener.postMessage(payload, '*');
                }
              } catch (e) {}

              try {
                const bc = new BroadcastChannel('neon_auth_channel');
                bc.postMessage(payload);
              } catch (e) {}

              document.getElementById('msg').textContent = 'Connected! Closing window...';
              setTimeout(() => {
                try { window.close(); } catch (e) {}
              }, 400);
            })();
          </script>
        </body>
      </html>
    `);
  });

  // User Profile Sync
  app.post('/api/users/sync', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user!.uid;
      const email = req.body?.email || req.user!.email || 'user@example.com';
      const username = req.body?.username;
      const user = await getOrCreateUser(uid, email, username);
      res.json(user);
    } catch (error: any) {
      console.error('User sync error:', error);
      res.status(500).json({ error: error.message || 'Failed to sync user' });
    }
  });

  // Fetch Full Library (presets, samples, kits)
  app.get('/api/library', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.uid;
      const library = await fetchFullLibrary(userId);
      res.json(library);
    } catch (error: any) {
      console.error('Fetch library error:', error);
      res.status(500).json({
        error: error.message || 'Failed to fetch library',
        userPresets: [],
        publicPresets: [],
        factoryPresets: [],
        userSamples: [],
        publicSamples: [],
        factorySamples: [],
      });
    }
  });

  // Create Preset
  app.post('/api/presets', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.uid;
      const { name, parameters, sequencerData, slicesData, sampleId, isPublic, isFactory } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Preset name is required' });
      }

      const preset = await createPreset({
        name,
        parameters,
        sequencerData,
        slicesData,
        userId,
        sampleId,
        isPublic,
        isFactory,
      });

      res.status(201).json(preset);
    } catch (error: any) {
      console.error('Create preset error:', error);
      res.status(500).json({ error: error.message || 'Failed to create preset' });
    }
  });

  // Update Preset
  app.put('/api/presets/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.uid;
      const id = String(req.params.id);
      const { name, parameters, sequencerData, slicesData, isPublic } = req.body;

      const preset = await updatePreset(id, userId, {
        name,
        parameters,
        sequencerData,
        slicesData,
        isPublic,
      });

      if (!preset) {
        return res.status(404).json({ error: 'Preset not found or not owned by user' });
      }

      res.json(preset);
    } catch (error: any) {
      console.error('Update preset error:', error);
      res.status(500).json({ error: error.message || 'Failed to update preset' });
    }
  });

  // Delete Preset
  app.delete('/api/presets/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.uid;
      const id = String(req.params.id);
      const deleted = await deletePreset(id, userId);

      if (!deleted) {
        return res.status(404).json({ error: 'Preset not found or permission denied' });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete preset error:', error);
      res.status(500).json({ error: error.message || 'Failed to delete preset' });
    }
  });

  // Storage status check
  app.get('/api/storage/status', (_req, res) => {
    const s3Ready = isS3Configured();
    const config = getS3Config();
    res.json({
      s3Enabled: s3Ready,
      bucket: config.bucket || null,
      region: config.region || null,
      customEndpoint: Boolean(config.endpoint),
      storageType: s3Ready ? 's3' : 'local_disk',
    });
  });

  // Presigned URL for direct S3 upload
  app.post('/api/storage/presigned-url', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!isS3Configured()) {
        return res.status(400).json({
          error: 'S3 storage is not configured. Please set S3_BUCKET_NAME and AWS credentials.',
        });
      }
      const { filename, contentType } = req.body;
      const cleanName = (filename || 'audio.wav').replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueKey = `samples/${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${cleanName}`;
      const presigned = await generatePresignedUploadUrl(uniqueKey, contentType || 'audio/wav');
      res.json(presigned);
    } catch (error: any) {
      console.error('Presigned URL error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate presigned URL' });
    }
  });

  // Upload Sample (File + DB Record)
  app.post('/api/samples/upload', optionalAuth, upload.single('file'), async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.uid || 'anon';
      const file = req.file;
      const title = req.body.title || file?.originalname || 'Untitled Sample';
      const isPublic = req.body.isPublic === 'true' || req.body.isPublic === true;
      const isFactory = req.body.isFactory === 'true' || req.body.isFactory === true;

      let publicUrl = '';

      // 1. If S3 is configured, upload directly to S3
      if (isS3Configured() && (file || req.body.audioData)) {
        try {
          let buffer: Buffer;
          let originalName = 'sample.wav';
          let mimeType = 'audio/wav';

          if (file) {
            buffer = fs.readFileSync(file.path);
            originalName = file.originalname;
            mimeType = file.mimetype || 'audio/wav';
            // Cleanup local temp file
            try {
              fs.unlinkSync(file.path);
            } catch (e) {
              // ignore
            }
          } else {
            const base64Data = req.body.audioData.replace(/^data:audio\/\w+;base64,/, '');
            buffer = Buffer.from(base64Data, 'base64');
          }

          const cleanName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
          const key = `samples/${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${cleanName}`;
          const s3Result = await uploadBufferToS3(buffer, key, mimeType);
          publicUrl = s3Result.url;
        } catch (s3Err) {
          console.warn('S3 upload error, falling back to local disk:', s3Err);
        }
      }

      // 2. Fallback to local storage or explicit url
      if (!publicUrl) {
        if (file) {
          publicUrl = `/uploads/${file.filename}`;
        } else if (req.body.audioData) {
          const filename = `${Date.now()}_audio.wav`;
          const filepath = path.join(uploadsDir, filename);
          const base64Data = req.body.audioData.replace(/^data:audio\/\w+;base64,/, '');
          fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
          publicUrl = `/uploads/${filename}`;
        } else if (req.body.url) {
          publicUrl = req.body.url;
        } else {
          return res.status(400).json({ error: 'No audio file or data provided' });
        }
      }

      const sample = await createSample({
        userId,
        title,
        url: publicUrl,
        isPublic,
        isFactory,
      });

      res.status(201).json({
        publicUrl: sample.url,
        id: sample.id,
        title: sample.title,
      });
    } catch (error: any) {
      console.error('Upload sample error:', error);
      res.status(500).json({ error: error.message || 'Failed to upload sample' });
    }
  });

  // Delete Sample
  app.delete('/api/samples/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.uid;
      const id = String(req.params.id);
      const deleted = await deleteSample(id, userId);

      if (!deleted) {
        return res.status(404).json({ error: 'Sample not found or permission denied' });
      }

      const sampleUrl = req.body?.url;
      // Cleanup S3 object if it was stored in S3
      if (sampleUrl && (sampleUrl.includes('amazonaws.com') || sampleUrl.includes('/samples/'))) {
        try {
          const urlObj = new URL(sampleUrl.startsWith('http') ? sampleUrl : `http://dummy.com${sampleUrl}`);
          const key = urlObj.pathname.replace(/^\/+/, '').split('/').slice(-2).join('/');
          if (key && key.startsWith('samples/')) {
            await deleteFromS3(key);
          }
        } catch (e) {
          console.warn('Could not delete S3 object:', e);
        }
      }

      // Cleanup local file if stored locally
      if (sampleUrl && sampleUrl.startsWith('/uploads/')) {
        const filePath = path.join(process.cwd(), 'public', sampleUrl);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (e) {
            console.warn('Could not remove file on disk:', e);
          }
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete sample error:', error);
      res.status(500).json({ error: error.message || 'Failed to delete sample' });
    }
  });

  // Create Kit
  app.post('/api/kits', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.uid;
      const { name, description, coverImageUrl, isPublic, isFactory, sampleIds } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Kit name is required' });
      }

      const kit = await createKit({
        name,
        description,
        coverImageUrl,
        userId,
        isPublic,
        isFactory,
      });

      if (sampleIds && Array.isArray(sampleIds) && sampleIds.length > 0) {
        await linkSamplesToKit(kit.id, sampleIds);
      }

      res.status(201).json(kit);
    } catch (error: any) {
      console.error('Create kit error:', error);
      res.status(500).json({ error: error.message || 'Failed to create kit' });
    }
  });

  // Link Samples to Kit
  app.post('/api/kits/:id/samples', requireAuth, async (req: Request, res: Response) => {
    try {
      const kitId = String(req.params.id);
      const { sampleIds } = req.body;
      if (!sampleIds || !Array.isArray(sampleIds)) {
        return res.status(400).json({ error: 'sampleIds array is required' });
      }

      await linkSamplesToKit(kitId, sampleIds);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Link samples error:', error);
      res.status(500).json({ error: error.message || 'Failed to link samples to kit' });
    }
  });

  // Rename Item (preset | sample | kit)
  app.patch('/api/items/:type/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.uid;
      const type = String(req.params.type) as 'preset' | 'sample' | 'kit';
      const id = String(req.params.id);
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'New name is required' });
      }

      const success = await renameItem(type, id, name, userId);
      if (!success) {
        return res.status(404).json({ error: `${type} not found or permission denied` });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Rename item error:', error);
      res.status(500).json({ error: error.message || 'Failed to rename item' });
    }
  });

  // Submit Feedback
  app.post('/api/feedback', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.uid;
      const { message, category } = req.body;
      if (!message) {
        return res.status(400).json({ error: 'Feedback message is required' });
      }

      const fb = await createFeedback({
        userId,
        message,
        category: category || 'other',
      });

      res.status(201).json({ success: true, id: fb.id });
    } catch (error: any) {
      console.error('Submit feedback error:', error);
      res.status(500).json({ error: error.message || 'Failed to submit feedback' });
    }
  });

  // Get All Feedback
  app.get('/api/feedback', async (_req, res: Response) => {
    try {
      const feedbackList = await getAllFeedback();
      res.json(feedbackList);
    } catch (error: any) {
      console.error('Get feedback error:', error);
      res.status(500).json({ error: error.message || 'Failed to get feedback', data: [] });
    }
  });

  // Seed default factory samples if table is empty
  try {
    const existingSamples = await fetchFullLibrary();
    if (existingSamples.factorySamples.length === 0) {
      const factoryAudio = [
        { id: 'synth_block_a_hi', title: 'Synth Block A (Hi)', url: '/Audio/Synth_Block_A_hi.wav', isFactory: true, isPublic: true },
        { id: 'synth_block_a_lo', title: 'Synth Block A (Lo)', url: '/Audio/Synth_Block_A_lo.wav', isFactory: true, isPublic: true },
        { id: 'noise_16_16', title: 'Noise 16/16', url: '/Audio/Noise_16_16.wav', isFactory: true, isPublic: true },
      ];
      for (const fa of factoryAudio) {
        await createSample(fa);
      }
      console.log('Seeded factory samples into Cloud SQL database');
    }
  } catch (seedErr) {
    console.warn('Initial factory seed check notice:', seedErr);
  }

  // Vite middleware for development vs static build for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Beat Slicer Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
