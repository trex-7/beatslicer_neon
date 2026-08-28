import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';

// S3 / Neon Object Storage configuration supporting Neon Storage, AWS S3, Cloudflare R2, MinIO, Wasabi
let s3ClientInstance: S3Client | null = null;

export function getS3Config() {
  const bucket =
    process.env.NEON_STORAGE_BUCKET ||
    process.env.S3_BUCKET_NAME ||
    process.env.AWS_S3_BUCKET ||
    process.env.AWS_BUCKET_NAME ||
    'beat-slicer';
  const region =
    process.env.NEON_STORAGE_REGION ||
    process.env.AWS_REGION ||
    process.env.S3_REGION ||
    'us-east-2';
  const accessKeyId =
    process.env.NEON_STORAGE_ACCESS_KEY_ID ||
    process.env.AWS_ACCESS_KEY_ID ||
    process.env.S3_ACCESS_KEY_ID ||
    'nak_live_897e7825c27b46c3b913ebb94723a754';
  const secretAccessKey =
    process.env.NEON_STORAGE_SECRET_ACCESS_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY ||
    process.env.S3_SECRET_ACCESS_KEY ||
    'nsk_live_dcf0414b01ed8fb651e2f5e15896992ab4304fc43e2ed8fc306e4c2d8251a50d';
  const endpoint =
    process.env.AWS_ENDPOINT_URL_S3 ||
    process.env.NEON_STORAGE_ENDPOINT ||
    process.env.S3_ENDPOINT ||
    process.env.AWS_ENDPOINT_URL ||
    'https://br-red-haze-axuhpihj.storage.c-4.us-east-2.aws.neon.tech';
  const publicBaseUrl =
    process.env.NEON_STORAGE_PUBLIC_URL ||
    process.env.S3_PUBLIC_URL ||
    process.env.AWS_S3_PUBLIC_URL;
  const forcePathStyle =
    process.env.NEON_STORAGE_FORCE_PATH_STYLE === 'true' ||
    process.env.S3_FORCE_PATH_STYLE === 'true' ||
    true;

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
      throw new Error('S3 credentials (AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY) are not configured.');
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
  } else if (config.endpoint) {
    // Custom S3 compatible endpoint (e.g. MinIO, Cloudflare R2)
    publicUrl = `${config.endpoint.replace(/\/+$/, '')}/${config.bucket}/${key}`;
  } else {
    // Standard AWS S3 URL
    publicUrl = `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
  }

  return { url: publicUrl, key };
}

/**
 * Deletes an object from S3 storage by key.
 */
export async function deleteFromS3(key: string): Promise<boolean> {
  if (!isS3Configured()) return false;
  try {
    const s3 = getS3Client();
    const config = getS3Config();
    const command = new DeleteObjectCommand({
      Bucket: config.bucket!,
      Key: key,
    });
    await s3.send(command);
    return true;
  } catch (error) {
    console.error(`Failed to delete object "${key}" from S3:`, error);
    return false;
  }
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

