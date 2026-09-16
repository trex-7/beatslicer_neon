import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';

// S3 / Neon Object Storage configuration supporting Neon Storage, AWS S3, Cloudflare R2, MinIO, Wasabi
let s3ClientInstance: S3Client | null = null;

function cleanEnv(val?: string): string {
  if (!val) return '';
  let str = val.trim();
  while ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }
  return str;
}

export function getS3Config() {
  const bucket =
    cleanEnv(process.env.STORAGE_BUCKET_NAME) ||
    cleanEnv(process.env.STORAGE_BUCKET) ||
    cleanEnv(process.env.NEON_STORAGE_BUCKET) ||
    cleanEnv(process.env.AWS_S3_BUCKET_NAME) ||
    cleanEnv(process.env.S3_BUCKET_NAME) ||
    cleanEnv(process.env.AWS_BUCKET) ||
    ['beat', 'slicer'].join('-');

  const region =
    cleanEnv(process.env.AWS_REGION) ||
    cleanEnv(process.env.REGION) ||
    cleanEnv(process.env.STORAGE_REGION) ||
    cleanEnv(process.env.NEON_STORAGE_REGION) ||
    ['us', 'east', '2'].join('-');

  const accessKeyId =
    cleanEnv(process.env.AWS_ACCESS_KEY_ID) ||
    cleanEnv(process.env.ACCESS_KEY_ID) ||
    cleanEnv(process.env.STORAGE_ACCESS_KEY_ID) ||
    cleanEnv(process.env.STORAGE_ACCESS_KEY) ||
    cleanEnv(process.env.NEON_STORAGE_ACCESS_KEY_ID) ||
    '';

  const secretAccessKey =
    cleanEnv(process.env.AWS_SECRET_ACCESS_KEY) ||
    cleanEnv(process.env.SECRET_ACCESS_KEY) ||
    cleanEnv(process.env.STORAGE_SECRET_ACCESS_KEY) ||
    cleanEnv(process.env.STORAGE_SECRET_KEY) ||
    cleanEnv(process.env.NEON_STORAGE_SECRET_ACCESS_KEY) ||
    '';

  const endpoint =
    cleanEnv(process.env.AWS_ENDPOINT_URL_S3) ||
    cleanEnv(process.env.ENDPOINT_URL_S3) ||
    cleanEnv(process.env.STORAGE_ENDPOINT) ||
    cleanEnv(process.env.NEON_STORAGE_ENDPOINT) ||
    '';

  const publicBaseUrl =
    cleanEnv(process.env.STORAGE_PUBLIC_URL) ||
    cleanEnv(process.env.NEON_STORAGE_PUBLIC_URL);

  const forcePathStyle = true;

  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    endpoint,
    publicBaseUrl,
    forcePathStyle,
  };
}

export function isS3Configured(): boolean {
  const config = getS3Config();
  return Boolean(config.bucket && config.accessKeyId && config.secretAccessKey);
}

export function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    const config = getS3Config();
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new Error('S3 credentials (ACCESS_KEY_ID & SECRET_ACCESS_KEY) are not configured.');
    }

    s3ClientInstance = new S3Client({
      region: config.region,
      endpoint: config.endpoint || undefined,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return s3ClientInstance;
}

/**
 * Uploads a file buffer directly to S3 storage.
 */
export async function uploadBufferToS3(
  buffer: Buffer,
  key: string,
  contentType: string = 'audio/wav'
): Promise<{ url: string; key: string }> {
  const s3 = getS3Client();
  const config = getS3Config();

  if (!config.bucket) {
    throw new Error('S3_BUCKET_NAME is not configured.');
  }

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3.send(command);

  let publicUrl = '';
  if (config.publicBaseUrl) {
    publicUrl = `${config.publicBaseUrl.replace(/\/+$/, '')}/${key}`;
  } else {
    // Default to proxy stream endpoint to guarantee CORS and prevent 403 Forbidden on private buckets
    publicUrl = `/api/storage/stream?key=${encodeURIComponent(key)}`;
  }

  return { url: publicUrl, key };
}

/**
 * Extracts the clean S3 object key from a full URL or relative path.
 */
export function extractS3KeyFromUrl(urlOrKey: string): string | null {
  if (!urlOrKey) return null;
  const trimmed = urlOrKey.trim();

  // If already a relative key without http
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    let clean = trimmed.replace(/^\/+/, '');
    const config = getS3Config();
    if (config.bucket && clean.startsWith(`${config.bucket}/`)) {
      clean = clean.substring(config.bucket.length + 1);
    }
    return clean || null;
  }

  try {
    const parsed = new URL(trimmed);
    let pathname = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
    const config = getS3Config();
    if (config.bucket && pathname.startsWith(`${config.bucket}/`)) {
      pathname = pathname.substring(config.bucket.length + 1);
    }
    return pathname || null;
  } catch (e) {
    const match = trimmed.match(/https?:\/\/[^\/]+\/(.+)$/);
    if (match && match[1]) {
      let pathPart = decodeURIComponent(match[1]).replace(/^\/+/, '');
      const config = getS3Config();
      if (config.bucket && pathPart.startsWith(`${config.bucket}/`)) {
        pathPart = pathPart.substring(config.bucket.length + 1);
      }
      return pathPart;
    }
    return null;
  }
}

/**
 * Deletes an object from S3 storage by key.
 */
export async function deleteFromS3(keyOrUrl: string): Promise<boolean> {
  if (!isS3Configured()) return false;
  try {
    const key = extractS3KeyFromUrl(keyOrUrl);
    if (!key) {
      console.warn(`[S3] Could not extract valid key from: "${keyOrUrl}"`);
      return false;
    }

    const s3 = getS3Client();
    const config = getS3Config();
    const command = new DeleteObjectCommand({
      Bucket: config.bucket!,
      Key: key,
    });
    await s3.send(command);
    console.log(`[S3] Successfully deleted object "${key}" from bucket "${config.bucket}"`);
    return true;
  } catch (error) {
    console.error(`Failed to delete object "${keyOrUrl}" from S3:`, error);
    return false;
  }
}

/**
 * Deletes an asset from both S3 and local disk (if present).
 */
export async function deleteStorageAsset(keyOrUrl: string): Promise<{ s3Deleted: boolean; diskDeleted: boolean }> {
  let s3Deleted = false;
  let diskDeleted = false;

  // 1. Delete from S3
  if (isS3Configured()) {
    try {
      s3Deleted = await deleteFromS3(keyOrUrl);
    } catch (err) {
      console.warn('[Storage] S3 deletion error:', err);
    }
  }

  // 2. Delete from local disk if it was an uploaded or local file
  try {
    const filename = path.basename(keyOrUrl.split('?')[0]);
    if (filename) {
      const candidatePaths = [
        path.join(process.cwd(), 'public', 'uploads', filename),
        path.join(process.cwd(), 'public', 'Audio', filename),
      ];

      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          try {
            fs.unlinkSync(p);
            diskDeleted = true;
            console.log(`[Storage] Deleted local file on disk: ${p}`);
          } catch (e) {
            console.warn(`[Storage] Failed to unlink local file ${p}:`, e);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Storage] Local disk cleanup error:', err);
  }

  return { s3Deleted, diskDeleted };
}

export interface S3ObjectItem {
  key: string;
  size: number;
  lastModified?: string;
  url: string;
}

export interface S3ListResult {
  success: boolean;
  count: number;
  objects: S3ObjectItem[];
  error?: string;
  errorName?: string;
  statusCode?: number;
  bucket?: string;
  region?: string;
}

/**
 * Lists all objects stored in the S3 / Neon storage bucket with full error diagnostics.
 */
export async function listS3ObjectsWithDetails(prefix: string = '', maxKeys: number = 200): Promise<S3ListResult> {
  if (!isS3Configured()) {
    return { success: false, count: 0, objects: [], error: 'S3 credentials not configured' };
  }
  const config = getS3Config();
  try {
    const s3 = getS3Client();
    const command = new ListObjectsV2Command({
      Bucket: config.bucket!,
      Prefix: prefix || undefined,
      MaxKeys: maxKeys,
    });

    const response = await s3.send(command);
    const contents = response.Contents || [];
    const objects = contents.map((obj) => {
      const key = obj.Key || '';
      let url = `/api/storage/stream?key=${encodeURIComponent(key)}`;
      if (config.publicBaseUrl) {
        url = `${config.publicBaseUrl.replace(/\/+$/, '')}/${key}`;
      }

      return {
        key,
        size: obj.Size || 0,
        lastModified: obj.LastModified ? obj.LastModified.toISOString() : undefined,
        url,
      };
    });

    console.log(`[S3 List] Successfully listed ${objects.length} objects from bucket "${config.bucket}" (prefix: "${prefix}")`);
    return {
      success: true,
      count: objects.length,
      objects,
      bucket: config.bucket,
      region: config.region,
    };
  } catch (error: any) {
    const errorName = error?.name || error?.code || 'UnknownError';
    const statusCode = error?.$metadata?.httpStatusCode;
    console.error(`[S3 List Error] Failed to list bucket "${config.bucket}":`, error?.message || error, `(Code: ${errorName}, HTTP ${statusCode})`);
    return {
      success: false,
      count: 0,
      objects: [],
      error: error?.message || String(error),
      errorName,
      statusCode,
      bucket: config.bucket,
      region: config.region,
    };
  }
}

/**
 * Lists all objects stored in the S3 / Neon storage bucket.
 */
export async function listS3Objects(prefix: string = '', maxKeys: number = 200): Promise<S3ObjectItem[]> {
  const result = await listS3ObjectsWithDetails(prefix, maxKeys);
  return result.objects;
}

/**
 * Generates a presigned PUT URL for client-side direct uploads.
 */
export async function generatePresignedUploadUrl(
  key: string,
  contentType: string = 'audio/wav',
  expiresInSeconds: number = 300
): Promise<{ uploadUrl: string; fileUrl: string; key: string }> {
  const s3 = getS3Client();
  const config = getS3Config();

  if (!config.bucket) {
    throw new Error('S3_BUCKET_NAME is not configured.');
  }

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });

  let fileUrl = '';
  if (config.publicBaseUrl) {
    fileUrl = `${config.publicBaseUrl.replace(/\/+$/, '')}/${key}`;
  } else if (config.endpoint) {
    fileUrl = `${config.endpoint.replace(/\/+$/, '')}/${config.bucket}/${key}`;
  } else {
    fileUrl = `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
  }

  return { uploadUrl, fileUrl, key };
}

/**
 * Generates a presigned GET URL for private object download.
 */
export async function generatePresignedDownloadUrl(
  key: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const s3 = getS3Client();
  const config = getS3Config();

  if (!config.bucket) {
    throw new Error('S3_BUCKET_NAME is not configured.');
  }

  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  });

  return await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

/**
 * Retrieves an object's buffer directly from S3 using GetObjectCommand.
 */
export async function getObjectBufferFromS3(keyOrUrl: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!isS3Configured()) return null;
  const rawKey = extractS3KeyFromUrl(keyOrUrl);
  if (!rawKey) return null;

  const s3 = getS3Client();
  const config = getS3Config();
  const filename = path.basename(rawKey);

  // Clean filename removing timestamps (e.g. 1789474704436_51h6gu_) and Source suffixes
  const withoutTimestamp = filename.replace(/^\d+_[a-z0-9]+_/, '');
  const cleanBaseName = withoutTimestamp
    .replace(/__Source_\.wav$/i, '')
    .replace(/\.wav__Source_\.wav$/i, '')
    .replace(/__Source_$/i, '')
    .replace(/ \((Source|Raw Audio|Custom Audio)\)\.wav$/i, '')
    .replace(/ \((Source|Raw Audio|Custom Audio)\)$/i, '');
  
  const cleanWithWav = cleanBaseName.endsWith('.wav') || cleanBaseName.endsWith('.mp3') || cleanBaseName.endsWith('.ogg')
    ? cleanBaseName
    : `${cleanBaseName}.wav`;

  const normalizedKey = rawKey
    .replace(/^api\//, '')
    .replace(/^uploads\//, '')
    .replace(/^Audio\//, '')
    .replace(/^samples\//, '');

  const withoutAudioAssets = normalizedKey.replace(/^audio-assets\//, '');

  let factorySubpath = '';
  const factoryMatch = rawKey.match(/(factory\/kits\/.+)$/);
  if (factoryMatch) {
    factorySubpath = factoryMatch[1];
  } else {
    const kitsMatch = rawKey.match(/(kits\/.+)$/);
    if (kitsMatch) {
      factorySubpath = `factory/${kitsMatch[1]}`;
    }
  }

  const candidateKeys = Array.from(new Set([
    rawKey,
    `samples/${filename}`,
    `samples/${withoutTimestamp}`,
    `samples/${cleanWithWav}`,
    `samples/${cleanBaseName}`,
    normalizedKey,
    `samples/${normalizedKey}`,
    cleanWithWav,
    filename,
    withoutTimestamp,
    factorySubpath ? `samples/${factorySubpath}` : '',
    `samples/${withoutAudioAssets}`,
    `factory/${withoutAudioAssets}`,
    `uploads/${normalizedKey}`,
    `Audio/${normalizedKey}`,
    `uploads/${filename}`,
  ].filter(Boolean)));

  for (const candidateKey of candidateKeys) {
    try {
      const command = new GetObjectCommand({
        Bucket: config.bucket!,
        Key: candidateKey,
      });

      const response = await s3.send(command);
      if (response.Body) {
        const byteArray = await response.Body.transformToByteArray();
        const ext = path.extname(candidateKey).toLowerCase();
        const defaultType = ext === '.mp3' ? 'audio/mpeg' : ext === '.ogg' ? 'audio/ogg' : 'audio/wav';
        console.log(`[S3 Storage] Successfully matched candidate key "${candidateKey}" (${byteArray.length} bytes)`);
        return {
          buffer: Buffer.from(byteArray),
          contentType: response.ContentType || defaultType,
        };
      }
    } catch (error: any) {
      if (error?.name !== 'NoSuchKey' && error?.$metadata?.httpStatusCode !== 404) {
        console.warn(`[S3 Storage DBG] Candidate key "${candidateKey}" error: ${error?.name || error?.code || error?.message || error} (Status: ${error?.$metadata?.httpStatusCode || 'N/A'})`);
      }
    }
  }

  // Smart S3 bucket fallback search: If candidates fail, list S3 objects to match by substring
  try {
    const listResult = await listS3ObjectsWithDetails('samples/', 50);
    if (listResult.success && listResult.objects.length > 0) {
      const searchTarget = cleanBaseName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = listResult.objects.find((o) => {
        const itemClean = path.basename(o.key).toLowerCase().replace(/[^a-z0-9]/g, '');
        return itemClean.includes(searchTarget) || searchTarget.includes(itemClean);
      }) || (listResult.objects.length <= 2 ? listResult.objects[0] : null);

      if (match) {
        console.log(`[S3 Storage Fallback] Matched S3 file "${match.key}" for query "${keyOrUrl}"`);
        const command = new GetObjectCommand({
          Bucket: config.bucket!,
          Key: match.key,
        });
        const response = await s3.send(command);
        if (response.Body) {
          const byteArray = await response.Body.transformToByteArray();
          const ext = path.extname(match.key).toLowerCase();
          const defaultType = ext === '.mp3' ? 'audio/mpeg' : ext === '.ogg' ? 'audio/ogg' : 'audio/wav';
          return {
            buffer: Buffer.from(byteArray),
            contentType: response.ContentType || defaultType,
          };
        }
      }
    }
  } catch (searchErr) {
    console.warn('[S3 Storage Fallback] S3 search error:', searchErr);
  }

  return null;
}

/**
 * Synchronizes all factory and local audio files into the Neon S3 storage bucket.
 */
export async function syncLocalAudioToBucket(): Promise<{
  synced: Array<{ filename: string; key: string; url: string }>;
  errors: Array<{ filename: string; error: string }>;
  isConfigured: boolean;
}> {
  if (!isS3Configured()) {
    console.log('[Storage Sync] S3 / Neon storage is not configured, skipping cloud sync.');
    return { synced: [], errors: [], isConfigured: false };
  }

  const synced: Array<{ filename: string; key: string; url: string }> = [];
  const errors: Array<{ filename: string; error: string }> = [];

  const audioDirs = [
    path.join(process.cwd(), 'public', 'Audio'),
    path.join(process.cwd(), 'public', 'uploads'),
  ];

  for (const dir of audioDirs) {
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!['.wav', '.mp3', '.m4a', '.ogg', '.flac', '.m4v'].includes(ext)) {
        continue;
      }

      const filePath = path.join(dir, file);
      try {
        const stats = fs.statSync(filePath);
        if (!stats.isFile()) continue;

        const buffer = fs.readFileSync(filePath);
        const s3Key = `samples/${file}`;
        const contentType = ext === '.m4v' ? 'video/mp4' : 'audio/wav';

        console.log(`[Storage Sync] Uploading ${file} to Neon bucket at ${s3Key}...`);
        const result = await uploadBufferToS3(buffer, s3Key, contentType);
        synced.push({
          filename: file,
          key: s3Key,
          url: result.url,
        });
        console.log(`[Storage Sync] Successfully synced ${file} -> ${result.url}`);
      } catch (err: any) {
        console.error(`[Storage Sync] Failed to sync ${file}:`, err.message);
        errors.push({ filename: file, error: err.message || 'Upload failed' });
      }
    }
  }

  return { synced, errors, isConfigured: true };
}

