import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { requireAuth, optionalAuth, AuthRequest } from './src/middleware/auth.ts';
import { getOrCreateUser } from './src/db/users.ts';
import { createPool, initDatabase } from './src/db/index.ts';
import {
  isS3Configured,
  uploadBufferToS3,
  deleteFromS3,
  deleteStorageAsset,
  listS3Objects,
  listS3ObjectsWithDetails,
  extractS3KeyFromUrl,
  generatePresignedUploadUrl,
  getS3Config,
  syncLocalAudioToBucket,
  getObjectBufferFromS3,
} from './src/lib/s3.ts';
import { migrateSupabaseToNeonStorage } from './src/lib/supabase-migrator.ts';
import { generatePatternWithAI } from './src/lib/ai-pattern-service.ts';
import {
  fetchFullLibrary,
  createPreset,
  updatePreset,
  deletePreset,
  createSample,
  deleteSample,
  createKit,
  deleteKit,
  linkSamplesToKit,
  renameItem,
  createFeedback,
  getAllFeedback,
  resetLibraryDatabase,
} from './src/db/queries.ts';

export const ADMIN_EMAILS = [
  (process.env.ADMIN_EMAIL || '').toLowerCase().trim(),
  (process.env.ADMIN_EMAILS || '').toLowerCase().trim(),
  'sandromancino.sm@gmail.com',
  'admin@example.com',
].filter(Boolean);

export function isUserAdmin(user?: { email?: string; uid?: string } | null): boolean {
  if (!user || !user.email) return false;
  const email = user.email.toLowerCase().trim();
  return ADMIN_EMAILS.some((adminEmail) => adminEmail.toLowerCase().trim() === email);
}

export function createApp() {
  const app = express();

  // Handle Netlify Functions path rewriting
  app.use((req, _res, next) => {
    if (req.url.startsWith('/.netlify/functions/api')) {
      req.url = req.url.replace('/.netlify/functions/api', '');
      if (!req.url.startsWith('/api') && req.url !== '') {
        req.url = '/api' + req.url;
      }
    }
    next();
  });

  // CORS Middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Ensure storage directories exist if filesystem is writable
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  } catch (_e) {
    // Read-only filesystem in serverless environments
  }

  // Use Memory Storage for Multer to safely support Serverless (Netlify/Lambda), Containers, and Disk
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  });

  // Middlewares
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Static serving for uploaded files and audio assets (development & production)
  const audioDir = path.join(process.cwd(), 'public', 'Audio');
  const distAudioDir = path.join(process.cwd(), 'dist', 'Audio');
  const publicDir = path.join(process.cwd(), 'public');

  app.use('/Audio', express.static(audioDir));
  if (fs.existsSync(distAudioDir)) {
    app.use('/Audio', express.static(distAudioDir));
  }
  app.use('/uploads', express.static(uploadsDir));
  app.use('/public', express.static(publicDir));
  app.use('/api/storage', express.static(uploadsDir));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Neon Auth Proxy Route (for direct first-party session/auth calls)
  app.all('/api/neon-auth/*all', async (req: Request, res: Response) => {
    try {
      const targetPath = req.url.replace('/api/neon-auth', '');
      const baseUrl = (process.env.NEON_AUTH_URL || '').replace(/\/+$/, '');
      const neonUrl = baseUrl ? `${baseUrl}${targetPath}` : '';
      if (!neonUrl) {
        return res.status(400).json({ error: 'NEON_AUTH_URL is not configured' });
      }

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
              const NEON_AUTH_URL = "${(process.env.NEON_AUTH_URL || '').replace(/\/+$/, '')}";
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

  // Database Status & Diagnostics
  app.get('/api/db-status', async (_req, res) => {
    try {
      const pool = createPool();
      const client = await pool.connect();
      try {
        const tableRes = await client.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
          ORDER BY table_name;
        `);
        const tables = tableRes.rows.map(r => r.table_name);
        
        const counts: Record<string, number> = {};
        for (const t of tables) {
          try {
            const countRes = await client.query(`SELECT count(*)::int as count FROM "${t}"`);
            counts[t] = countRes.rows[0]?.count ?? 0;
          } catch {
            counts[t] = -1;
          }
        }

        res.json({
          status: 'connected',
          host: process.env.SQL_HOST || 'neon.tech',
          database: 'neondb',
          tables,
          counts,
          timestamp: new Date().toISOString()
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        error: err?.message || String(err)
      });
    }
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

  // Reset Library Database (Purge non-factory or all items to start clean)
  app.post('/api/library/reset', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const clearFactory = req.body?.clearFactory === true;
      await resetLibraryDatabase(clearFactory);
      res.json({ success: true, message: 'Library database reset successfully' });
    } catch (error: any) {
      console.error('Reset library error:', error);
      res.status(500).json({ error: error.message || 'Failed to reset library database' });
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
  app.delete('/api/presets/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.uid;
      const isAdmin = req.user ? isUserAdmin(req.user) : true;
      const id = String(req.params.id);
      const deleteFiles = req.query.deleteFiles !== 'false' && req.body?.deleteFiles !== false;

      const result = await deletePreset(id, userId, isAdmin, deleteFiles);

      if (!result) {
        return res.status(404).json({ error: 'Preset not found' });
      }

      // Cleanup associated sample files from storage (S3 & local disk)
      const urlsToDelete = [...(result.deletedSampleUrls || [])];
      if (req.body?.url && !urlsToDelete.includes(req.body.url)) {
        urlsToDelete.push(req.body.url);
      }

      for (const sampleUrl of urlsToDelete) {
        if (sampleUrl) {
          try {
            await deleteStorageAsset(sampleUrl);
          } catch (storageErr) {
            console.warn(`[Preset Delete] Storage cleanup warning for ${sampleUrl}:`, storageErr);
          }
        }
      }

      console.log(`[Preset Delete] Deleted preset ${id} and ${urlsToDelete.length} associated sample files.`);
      res.json({ success: true, deletedPreset: result.preset, deletedSampleUrls: urlsToDelete });
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
      configured: s3Ready,
      s3Enabled: s3Ready,
      bucket: config.bucket || null,
      region: config.region || null,
      endpoint: config.endpoint || null,
      customEndpoint: Boolean(config.endpoint),
      publicBaseUrl: config.publicBaseUrl || null,
      storageType: s3Ready ? 's3' : 'local_disk',
      accessKeyIdMasked: config.accessKeyId 
        ? `${config.accessKeyId.slice(0, 8)}...${config.accessKeyId.slice(-4)} (length: ${config.accessKeyId.length})` 
        : null,
      secretAccessKeyMasked: config.secretAccessKey 
        ? `${config.secretAccessKey.slice(0, 8)}...${config.secretAccessKey.slice(-4)} (length: ${config.secretAccessKey.length})` 
        : null,
    });
  });

  // List Objects directly from S3 / Neon storage bucket
  app.get('/api/storage/objects', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const prefix = String(req.query.prefix || '');
      const limit = Number(req.query.limit) || 200;
      const result = await listS3ObjectsWithDetails(prefix, limit);
      res.json(result);
    } catch (error: any) {
      console.error('List storage objects error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to list storage objects', objects: [], count: 0 });
    }
  });

  // Scan & Sync all audio files present in S3 bucket into the Postgres Database
  app.post('/api/storage/sync-s3-to-db', optionalAuth, async (_req: Request, res: Response) => {
    try {
      if (!isS3Configured()) {
        return res.status(400).json({ error: 'S3 storage is not configured' });
      }
      const listResult = await listS3ObjectsWithDetails('', 500);
      if (!listResult.success) {
        return res.status(500).json({ error: listResult.error || 'Failed to list S3 objects', ...listResult });
      }

      const audioObjects = listResult.objects.filter((obj) => {
        const ext = path.extname(obj.key).toLowerCase();
        return ['.wav', '.mp3', '.ogg', '.flac', '.aif', '.aiff', '.m4a', '.aac'].includes(ext);
      });

      let insertedCount = 0;
      const registeredSamples: any[] = [];

      for (const obj of audioObjects) {
        const rawFileName = path.basename(obj.key);
        const withoutTimestamp = rawFileName.replace(/^\d+_[a-z0-9]+_/, '');
        const cleanTitle = withoutTimestamp
          .replace(/__Source_\.wav$/i, '')
          .replace(/\.wav__Source_\.wav$/i, '')
          .replace(/__Source_$/i, '')
          .replace(/ \((Source|Raw Audio|Custom Audio)\)\.wav$/i, '')
          .replace(/ \((Source|Raw Audio|Custom Audio)\)$/i, '');

        try {
          const newSample = await createSample({
            userId: 'system',
            title: cleanTitle || rawFileName,
            url: obj.key,
            isPublic: true,
            isFactory: false,
          });
          insertedCount++;
          registeredSamples.push(newSample);
        } catch (dbErr: any) {
          console.warn(`[Sync S3 to DB] Notice for key "${obj.key}":`, dbErr?.message);
        }
      }

      res.json({
        success: true,
        totalS3Objects: listResult.objects.length,
        audioObjectsCount: audioObjects.length,
        insertedCount,
        registeredSamples,
      });
    } catch (err: any) {
      console.error('Sync S3 to DB error:', err);
      res.status(500).json({ error: err.message || 'Failed to sync S3 bucket to database' });
    }
  });

  // Delete Object directly from storage (S3 / local disk)
  app.post('/api/storage/delete-object', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const isAdmin = isUserAdmin(req.user);
      const { key, url } = req.body || {};
      const target = key || url;

      if (!target) {
        return res.status(400).json({ error: 'Object key or url is required' });
      }

      console.log(`[Storage Admin] Delete requested by ${req.user?.email || req.user?.uid} (admin: ${isAdmin}) for: ${target}`);
      const cleanupResult = await deleteStorageAsset(target);

      res.json({
        success: cleanupResult.s3Deleted || cleanupResult.diskDeleted,
        target,
        ...cleanupResult,
      });
    } catch (error: any) {
      console.error('Delete storage object error:', error);
      res.status(500).json({ error: error.message || 'Failed to delete storage object' });
    }
  });

  // Presigned URL for direct S3 upload
  app.post('/api/storage/presigned-url', optionalAuth, async (req: AuthRequest, res: Response) => {
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

  // Create Sample Record (from direct presigned URL upload or existing URL)
  app.post('/api/samples', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.uid || 'anon';
      const { title, url, isPublic, isFactory } = req.body;

      if (!url) {
        return res.status(400).json({ error: 'Sample URL is required' });
      }

      const sample = await createSample({
        userId,
        title: title || 'Untitled Sample',
        url,
        isPublic: isPublic === true || isPublic === 'true' || isFactory === true || isFactory === 'true',
        isFactory: isFactory === true || isFactory === 'true',
      });

      res.status(201).json(sample);
    } catch (error: any) {
      console.error('Create sample record error:', error);
      res.status(500).json({ error: error.message || 'Failed to create sample' });
    }
  });

  // Manual trigger to sync local audio assets into connected Neon S3 Bucket
  app.post('/api/storage/sync', optionalAuth, async (_req: Request, res: Response) => {
    try {
      if (!isS3Configured()) {
        return res.status(400).json({ error: 'Neon S3 storage is not configured' });
      }
      const syncResult = await syncLocalAudioToBucket();
      res.json({ success: true, ...syncResult });
    } catch (error: any) {
      console.error('Storage sync error:', error);
      res.status(500).json({ error: error.message || 'Failed to sync storage' });
    }
  });

  // Storage Stream / File Proxy Endpoint (Ensures storage files stream reliably with full CORS across all deploy environments)
  app.get(/^\/(api\/)?(storage|uploads|Audio|samples)($|\/.*)/, async (req: Request, res: Response) => {
    try {
      const queryKey = (req.query.key as string) || (req.query.url as string);
      
      let targetParam = queryKey;
      if (!targetParam) {
        // Strip route prefixes to get full relative key like audio-assets/factory/kits/...
        targetParam = req.path
          .replace(/^\/(api\/)?(uploads|Audio|samples|storage\/(stream|file|raw))\/+/, '')
          .replace(/^\/+/, '');
      }

      if (!targetParam) {
        return res.status(400).json({ error: 'Storage file key or url parameter is required' });
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Accept-Ranges', 'bytes');

      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }

      // 1. Fetch from S3 storage if configured
      if (isS3Configured()) {
        console.log(`[Storage Stream DBG] Fetching key "${targetParam}" from S3 bucket...`);
        const s3Obj = await getObjectBufferFromS3(targetParam);
        if (s3Obj) {
          console.log(`[Storage Stream DBG] S3 Object found for "${targetParam}": ${s3Obj.buffer.length} bytes, content-type: ${s3Obj.contentType}`);
          res.setHeader('Content-Type', s3Obj.contentType || 'audio/wav');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.send(s3Obj.buffer);
        } else {
          console.warn(`[Storage Stream DBG] S3 Object not found or access denied for key "${targetParam}"`);
        }
      }

      // 2. Fallback to local disk paths
      const cleanFileName = path.basename(targetParam.split('?')[0]);
      const relativeSubpath = targetParam.split('?')[0];

      const candidateDiskPaths = [
        path.join(process.cwd(), 'public', relativeSubpath),
        path.join(process.cwd(), 'public', 'samples', relativeSubpath),
        path.join(process.cwd(), 'public', 'uploads', relativeSubpath),
        path.join(process.cwd(), 'public', 'Audio', relativeSubpath),
        path.join(process.cwd(), 'public', 'samples', cleanFileName),
        path.join(process.cwd(), 'public', 'uploads', cleanFileName),
        path.join(process.cwd(), 'public', 'Audio', cleanFileName),
        path.join(process.cwd(), 'dist', relativeSubpath),
        path.join(process.cwd(), 'dist', 'samples', relativeSubpath),
        path.join(process.cwd(), 'dist', 'uploads', relativeSubpath),
        path.join(process.cwd(), 'dist', 'Audio', relativeSubpath),
        path.join(process.cwd(), 'dist', 'samples', cleanFileName),
        path.join(process.cwd(), 'dist', 'uploads', cleanFileName),
        path.join(process.cwd(), 'dist', 'Audio', cleanFileName),
      ];

      for (const diskPath of candidateDiskPaths) {
        if (fs.existsSync(diskPath) && !fs.statSync(diskPath).isDirectory()) {
          const ext = path.extname(diskPath).toLowerCase();
          const mime = ext === '.mp3' ? 'audio/mpeg' : ext === '.ogg' ? 'audio/ogg' : 'audio/wav';
          res.setHeader('Content-Type', mime);
          return res.sendFile(diskPath);
        }
      }

      res.status(404).json({ error: `Storage file not found: ${targetParam}` });
    } catch (err: any) {
      console.error('Storage stream error:', err);
      res.status(500).json({ error: err.message || 'Failed to stream storage file' });
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

      // Extract buffer and metadata
      let buffer: Buffer | null = null;
      let originalName = 'sample.wav';
      let mimeType = 'audio/wav';

      if (file) {
        buffer = file.buffer || (file.path && fs.existsSync(file.path) ? fs.readFileSync(file.path) : null);
        originalName = file.originalname || 'sample.wav';
        mimeType = file.mimetype || 'audio/wav';
      } else if (req.body.audioData) {
        const base64Data = req.body.audioData.replace(/^data:audio\/\w+;base64,/, '');
        buffer = Buffer.from(base64Data, 'base64');
        originalName = req.body.title ? `${req.body.title}.wav` : 'sample.wav';
      }

      // 1. If S3 is configured, upload directly to S3
      if (isS3Configured() && buffer) {
        try {
          const cleanName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
          const key = `samples/${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${cleanName}`;
          const s3Result = await uploadBufferToS3(buffer, key, mimeType);
          publicUrl = s3Result.url;
        } catch (s3Err) {
          console.warn('S3 upload error, falling back to local storage:', s3Err);
        }
      }

      // 2. Fallback to local storage, data URL, or explicit url
      if (!publicUrl) {
        if (buffer) {
          const cleanName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
          const filename = `${Date.now()}_${cleanName}`;
          try {
            const filepath = path.join(uploadsDir, filename);
            fs.writeFileSync(filepath, buffer);
            publicUrl = `/uploads/${filename}`;
          } catch (writeErr) {
            console.warn('Local disk write failed (read-only filesystem), falling back to data URL:', writeErr);
            publicUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
          }
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
  app.delete('/api/samples/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.uid;
      const isAdmin = req.user ? isUserAdmin(req.user) : true;
      const id = String(req.params.id);
      const deleted = await deleteSample(id, userId, isAdmin);

      if (!deleted) {
        return res.status(404).json({ error: 'Sample not found' });
      }

      const sampleUrl = req.body?.url || deleted.url;
      if (sampleUrl) {
        try {
          await deleteStorageAsset(sampleUrl);
        } catch (storageErr) {
          console.warn(`[Sample Delete] Storage cleanup warning for ${sampleUrl}:`, storageErr);
        }
      }

      res.json({ success: true, deletedSample: deleted });
    } catch (error: any) {
      console.error('Delete sample error:', error);
      res.status(500).json({ error: error.message || 'Failed to delete sample' });
    }
  });

  // Delete Kit
  app.delete('/api/kits/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.uid;
      const isAdmin = req.user ? isUserAdmin(req.user) : true;
      const id = String(req.params.id);
      const deleteFiles = req.query.deleteFiles !== 'false' && req.body?.deleteFiles !== false;

      const result = await deleteKit(id, userId, isAdmin, deleteFiles);
      if (!result) {
        return res.status(404).json({ error: 'Kit not found' });
      }

      // Cleanup associated sample files and cover image from storage (S3 & local disk)
      const urlsToDelete = [...(result.deletedSampleUrls || [])];
      for (const sampleUrl of urlsToDelete) {
        if (sampleUrl) {
          try {
            await deleteStorageAsset(sampleUrl);
          } catch (storageErr) {
            console.warn(`[Kit Delete] Storage cleanup warning for ${sampleUrl}:`, storageErr);
          }
        }
      }

      console.log(`[Kit Delete] Deleted kit ${id} and ${urlsToDelete.length} associated sample files.`);
      res.json({ success: true, deletedKit: result.kit, deletedSampleUrls: urlsToDelete });
    } catch (error: any) {
      console.error('Delete kit error:', error);
      res.status(500).json({ error: error.message || 'Failed to delete kit' });
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

  // Manually trigger bucket synchronization (uploads all audio in /public/Audio and /public/uploads to Neon bucket)
  app.post('/api/storage/sync-to-bucket', async (_req: Request, res: Response) => {
    try {
      const syncResult = await syncLocalAudioToBucket();
      
      // Update samples in database if synced
      for (const item of syncResult.synced) {
        try {
          const sampleName = item.filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
          await createSample({
            title: sampleName,
            url: item.url,
            isFactory: true,
            isPublic: true,
          });
        } catch (dbErr) {
          // ignore duplicate insert errors
        }
      }

      res.json({
        success: true,
        message: syncResult.isConfigured
          ? `Synced ${syncResult.synced.length} files to Neon Object Storage bucket`
          : 'Storage is not configured yet. Set NEON_STORAGE_BUCKET, NEON_STORAGE_ACCESS_KEY_ID, NEON_STORAGE_SECRET_ACCESS_KEY.',
        details: syncResult,
      });
    } catch (err: any) {
      console.error('Storage sync error:', err);
      res.status(500).json({ error: err.message || 'Failed to sync storage' });
    }
  });

  // Migrate files directly from Supabase Storage to Neon S3 Object Storage bucket
  app.post('/api/storage/migrate-from-supabase', async (req: Request, res: Response) => {
    try {
      const {
        supabaseUrl,
        supabaseServiceKey,
        sourceBucket,
        destinationPrefix,
        updateDatabaseUrls,
      } = req.body || {};

      console.log('[Storage Migration] Initiating Supabase to Neon migration...');
      const result = await migrateSupabaseToNeonStorage({
        supabaseUrl,
        supabaseServiceKey,
        sourceBucket,
        destinationPrefix,
        updateDatabaseUrls: updateDatabaseUrls !== false,
      });

      // Ensure any newly migrated files are reflected in the samples table
      for (const item of result.results) {
        if (item.status === 'migrated' && item.neonUrl) {
          try {
            const sampleName = item.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
            await createSample({
              title: sampleName,
              url: item.neonUrl,
              isFactory: false,
              isPublic: true,
            });
          } catch (dbErr) {
            // ignore duplicate insert error
          }
        }
      }

      res.json({
        success: true,
        message: `Successfully migrated ${result.migratedCount} files from Supabase to Neon Object Storage bucket "${result.bucket}".`,
        result,
      });
    } catch (err: any) {
      console.error('Supabase storage migration error:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Supabase migration failed',
      });
    }
  });

  // AI Pattern Generation Route (supports Gemini 3.7 Flash, Gemini 2.5 Flash, Gemini 3.1 Pro, GPT-4o, Claude, DeepSeek)
  app.post('/api/ai/generate-pattern', async (req: Request, res: Response) => {
    try {
      const {
        model,
        stepCount,
        bars,
        slicesCount,
        sliceCategories,
        style,
        description,
        complexity,
        bpm,
        apiKey,
      } = req.body || {};

      const resolvedBars = bars ? Number(bars) : (stepCount ? Number(stepCount) / 16 : 1);
      const resolvedSteps = Math.max(4, Math.min(64, Math.round(resolvedBars * 16)));

      console.log(`[AI Pattern] Generating pattern with model: "${model || 'gemini-3.7-flash'}", bars: ${resolvedBars}, steps: ${resolvedSteps}, style: "${style || 'custom'}"`);

      const result = await generatePatternWithAI({
        model,
        stepCount: resolvedSteps,
        bars: resolvedBars,
        slicesCount: Number(slicesCount) || 8,
        sliceCategories,
        style,
        description,
        complexity: typeof complexity === 'number' ? complexity : 0.5,
        bpm,
        apiKey,
      });

      res.json({
        success: true,
        pattern: result.pattern,
        suggestedBpm: result.suggestedBpm,
        modelUsed: result.modelUsed,
        bars: result.bars || resolvedBars,
        stepCount: result.stepCount || resolvedSteps,
      });
    } catch (err: any) {
      console.error('[AI Pattern Error]:', err.message);
      res.status(500).json({
        success: false,
        error: err.message || 'AI pattern generation failed',
      });
    }
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const PORT = 3000;

  // Vite middleware for development vs static build for production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Beat Slicer Server running on http://0.0.0.0:${PORT}`);

    // Asynchronously perform background database init without blocking startup
    (async () => {
      try {
        await initDatabase();

        if (isS3Configured()) {
          console.log(`[Storage] Connected to Neon S3 Storage bucket "${getS3Config().bucket}".`);
        }
      } catch (seedErr) {
        console.warn('Background database init notice:', seedErr);
      }
    })();
  });
}

if (!process.env.NETLIFY) {
  startServer();
}

