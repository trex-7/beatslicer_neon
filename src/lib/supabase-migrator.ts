import { uploadBufferToS3, isS3Configured } from './s3.ts';

export interface MigrationOptions {
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  sourceBucket?: string;
  destinationPrefix?: string;
  updateDatabaseUrls?: boolean;
}

export interface MigrationResult {
  success: boolean;
  total: number;
  migrated: number;
  migratedCount: number;
  failed: number;
  bucket?: string;
  results: Array<{
    name: string;
    status: 'migrated' | 'failed' | 'skipped';
    neonUrl?: string;
    error?: string;
  }>;
}

/**
 * Migrates storage assets from a Supabase project into Neon/S3 object storage
 */
export async function migrateSupabaseToNeonStorage(
  options: MigrationOptions = {}
): Promise<MigrationResult> {
  const supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
  const serviceKey = options.supabaseServiceKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sourceBucket = options.sourceBucket || process.env.SUPABASE_STORAGE_BUCKET || 'samples';
  const prefix = options.destinationPrefix || 'migrated';

  if (!supabaseUrl || !serviceKey) {
    return {
      success: false,
      total: 0,
      migrated: 0,
      migratedCount: 0,
      failed: 0,
      results: [
        {
          name: 'configuration_check',
          status: 'failed',
          error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for storage migration',
        },
      ],
    };
  }

  if (!isS3Configured()) {
    return {
      success: false,
      total: 0,
      migrated: 0,
      migratedCount: 0,
      failed: 0,
      results: [
        {
          name: 'neon_s3_check',
          status: 'failed',
          error: 'Neon / S3 Object Storage is not configured. Please set NEON_STORAGE_BUCKET and credentials.',
        },
      ],
    };
  }

  try {
    // Dynamic import to support optional Supabase dependency
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: files, error: listError } = await supabase.storage
      .from(sourceBucket)
      .list('', { limit: 1000 });

    if (listError || !files) {
      throw new Error(`Failed to list files from Supabase bucket ${sourceBucket}: ${listError?.message}`);
    }

    const migrationResults: MigrationResult['results'] = [];
    let migratedCount = 0;
    let failedCount = 0;

    for (const file of files) {
      if (!file.name || file.name.endsWith('.emptyFolderPlaceholder')) {
        continue;
      }

      try {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from(sourceBucket)
          .download(file.name);

        if (downloadError || !fileData) {
          throw new Error(`Download failed: ${downloadError?.message}`);
        }

        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const destinationKey = `${prefix}/${file.name}`;
        const contentType = fileData.type || 'audio/wav';

        const uploadResult = await uploadBufferToS3(buffer, destinationKey, contentType);

        migrationResults.push({
          name: file.name,
          status: 'migrated',
          neonUrl: uploadResult.url,
        });
        migratedCount++;
      } catch (fileErr: any) {
        console.error(`[Migration Error] Failed to migrate file ${file.name}:`, fileErr);
        migrationResults.push({
          name: file.name,
          status: 'failed',
          error: fileErr.message || 'Unknown migration error',
        });
        failedCount++;
      }
    }

    return {
      success: failedCount === 0,
      total: files.length,
      migrated: migratedCount,
      migratedCount,
      failed: failedCount,
      bucket: process.env.NEON_STORAGE_BUCKET || process.env.S3_BUCKET_NAME || 'neon-storage',
      results: migrationResults,
    };
  } catch (error: any) {
    console.error('[Migration Fatal Error]:', error);
    return {
      success: false,
      total: 0,
      migrated: 0,
      migratedCount: 0,
      failed: 1,
      results: [
        {
          name: 'migration_process',
          status: 'failed',
          error: error.message || 'Failed to execute storage migration',
        },
      ],
    };
  }
}
