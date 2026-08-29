import { createClient } from '@supabase/supabase-js';
import { uploadBufferToS3, isS3Configured, getS3Config } from './s3.ts';
import { db } from '../db/index.ts';
import { samples } from '../db/schema.ts';
import { eq, sql } from 'drizzle-orm';
import path from 'path';

export interface SupabaseMigrationOptions {
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  sourceBucket?: string; // defaults to 'samples' or 'audio'
  destinationPrefix?: string; // defaults to 'samples/'
  updateDatabaseUrls?: boolean; // whether to update any database records pointing to Supabase URLs
}

export interface MigrationFileResult {
  name: string;
  sourceUrl: string;
  destinationKey: string;
  neonUrl: string;
  size?: number;
  status: 'migrated' | 'skipped' | 'failed';
  error?: string;
}

export interface MigrationSummary {
  success: boolean;
  totalFound: number;
  migratedCount: number;
  failedCount: number;
  skippedCount: number;
  databaseUpdatedCount: number;
  bucket: string;
  results: MigrationFileResult[];
  errors: string[];
}

function cleanEnv(val?: string): string {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '').trim();
}

/**
 * Migrates files from Supabase Storage bucket to Neon S3 Object Storage bucket.
 */
export async function migrateSupabaseToNeonStorage(
  options: SupabaseMigrationOptions = {}
): Promise<MigrationSummary> {
  const supabaseUrl =
    options.supabaseUrl ||
    cleanEnv(process.env.SUPABASE_URL) ||
    cleanEnv(process.env.VITE_SUPABASE_URL);

  const supabaseKey =
    options.supabaseServiceKey ||
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    cleanEnv(process.env.SUPABASE_ANON_KEY) ||
    cleanEnv(process.env.VITE_SUPABASE_ANON_KEY);

  const s3Config = getS3Config();

  if (!isS3Configured()) {
    throw new Error(
      'Neon Object Storage is not fully configured on server. Please ensure AWS_ACCESS_KEY_ID / NEON_STORAGE_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY / NEON_STORAGE_SECRET_ACCESS_KEY are set.'
    );
  }

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase credentials. Please provide SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in environment or request body.'
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const sourceBucket = options.sourceBucket || cleanEnv(process.env.SUPABASE_STORAGE_BUCKET) || 'samples';
  const prefix = options.destinationPrefix || 'samples/';

  console.log(`[Storage Migration] Starting migration from Supabase bucket "${sourceBucket}" to Neon Object Storage bucket "${s3Config.bucket}"...`);

  const results: MigrationFileResult[] = [];
  const globalErrors: string[] = [];

  // Helper to recursively list all files in Supabase bucket
  async function listAllFiles(folder = ''): Promise<Array<{ name: string; fullPath: string; id?: string; metadata?: any }>> {
    const { data, error } = await supabase.storage.from(sourceBucket).list(folder, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) {
      console.warn(`[Storage Migration] Error listing path "${folder}" in bucket "${sourceBucket}":`, error.message);
      globalErrors.push(`Failed to list path "${folder}": ${error.message}`);
      return [];
    }

    if (!data) return [];

    let fileList: Array<{ name: string; fullPath: string; id?: string; metadata?: any }> = [];
    for (const item of data) {
      const itemPath = folder ? `${folder}/${item.name}` : item.name;
      if (item.id === null || !item.metadata) {
        // It's a directory, recurse into it
        const subFiles = await listAllFiles(itemPath);
        fileList = fileList.concat(subFiles);
      } else {
        fileList.push({
          name: item.name,
          fullPath: itemPath,
          id: item.id,
          metadata: item.metadata,
        });
      }
    }
    return fileList;
  }

  // Also check other common Supabase bucket names if the primary one returns empty
  let discoveredFiles = await listAllFiles('');
  if (discoveredFiles.length === 0 && !options.sourceBucket) {
    const fallbackBuckets = ['audio', 'uploads', 'sound-samples', 'beats'];
    for (const altBucket of fallbackBuckets) {
      console.log(`[Storage Migration] Checking alternative Supabase bucket "${altBucket}"...`);
      const { data: testData } = await supabase.storage.from(altBucket).list('', { limit: 10 });
      if (testData && testData.length > 0) {
        console.log(`[Storage Migration] Found files in alternative bucket "${altBucket}". Using "${altBucket}".`);
        discoveredFiles = await (async () => {
          const { data } = await supabase.storage.from(altBucket).list('', { limit: 1000 });
          return (data || []).map((f) => ({
            name: f.name,
            fullPath: f.name,
            id: f.id,
            metadata: f.metadata,
          }));
        })();
        break;
      }
    }
  }

  let migratedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const file of discoveredFiles) {
    const ext = path.extname(file.name).toLowerCase();
    const contentType =
      file.metadata?.mimetype ||
      (ext === '.mp3' ? 'audio/mpeg' :
       ext === '.wav' ? 'audio/wav' :
       ext === '.ogg' ? 'audio/ogg' :
       ext === '.flac' ? 'audio/flac' :
       ext === '.m4a' ? 'audio/mp4' :
       ext === '.m4v' ? 'video/mp4' :
       ext === '.png' ? 'image/png' :
       ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
       'application/octet-stream');

    const destKey = `${prefix.replace(/\/$/, '')}/${file.fullPath}`.replace(/^\/+/, '');
    const sourceUrl = `${supabaseUrl}/storage/v1/object/public/${sourceBucket}/${file.fullPath}`;

    try {
      console.log(`[Storage Migration] Downloading "${file.fullPath}" from Supabase...`);
      const { data: fileData, error: downloadErr } = await supabase.storage
        .from(sourceBucket)
        .download(file.fullPath);

      if (downloadErr || !fileData) {
        throw new Error(downloadErr?.message || 'Failed to download data from Supabase');
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      console.log(`[Storage Migration] Uploading "${file.name}" (${buffer.length} bytes) to Neon Object Storage at key "${destKey}"...`);
      const uploadRes = await uploadBufferToS3(buffer, destKey, contentType);

      results.push({
        name: file.name,
        sourceUrl,
        destinationKey: destKey,
        neonUrl: uploadRes.url,
        size: buffer.length,
        status: 'migrated',
      });
      migratedCount++;
      console.log(`[Storage Migration] Successfully migrated "${file.name}" -> ${uploadRes.url}`);
    } catch (err: any) {
      console.error(`[Storage Migration] Error migrating "${file.name}":`, err.message);
      results.push({
        name: file.name,
        sourceUrl,
        destinationKey: destKey,
        neonUrl: '',
        status: 'failed',
        error: err.message || 'Migration error',
      });
      failedCount++;
    }
  }

  // Optional: Update database URLs for any existing samples that had Supabase URLs
  let databaseUpdatedCount = 0;
  if (options.updateDatabaseUrls !== false) {
    try {
      console.log('[Storage Migration] Checking database for records containing Supabase URLs to update...');
      const allDbSamples = await db.select().from(samples);
      for (const sampleItem of allDbSamples) {
        if (sampleItem.url && sampleItem.url.includes('supabase.co/storage')) {
          // Find if we migrated this exact file
          const fileName = path.basename(sampleItem.url);
          const migratedMatch = results.find(
            (r) => r.status === 'migrated' && (r.name === fileName || sampleItem.url.endsWith(r.name))
          );

          if (migratedMatch && migratedMatch.neonUrl) {
            await db
              .update(samples)
              .set({ url: migratedMatch.neonUrl })
              .where(eq(samples.id, sampleItem.id));
            databaseUpdatedCount++;
            console.log(`[Storage Migration] Updated database sample ID ${sampleItem.id} to new Neon URL: ${migratedMatch.neonUrl}`);
          }
        }
      }
    } catch (dbErr: any) {
      console.warn('[Storage Migration] Database URL update notice:', dbErr.message);
    }
  }

  return {
    success: failedCount === 0 && discoveredFiles.length > 0,
    totalFound: discoveredFiles.length,
    migratedCount,
    failedCount,
    skippedCount,
    databaseUpdatedCount,
    bucket: s3Config.bucket,
    results,
    errors: globalErrors,
  };
}
