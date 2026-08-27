import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// S3 Client configuration supporting AWS S3, Cloudflare R2, MinIO, Wasabi, and custom S3 endpoints
let s3ClientInstance: S3Client | null = null;

export function getS3Config() {
  const bucket = process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET || process.env.AWS_BUCKET_NAME;
  const region = process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;
  const endpoint = process.env.S3_ENDPOINT || process.env.AWS_ENDPOINT_URL;
  const publicBaseUrl = process.env.S3_PUBLIC_URL || process.env.AWS_S3_PUBLIC_URL;
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';

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
