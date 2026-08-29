import { db } from './index.ts';
import { presets, samples, kits, kitSamples, feedback, users } from './schema.ts';
import { eq, or, and, desc, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function fetchFullLibrary(userId?: string) {
  try {
    // 1. Presets
    const allPresets = await db
      .select({
        id: presets.id,
        name: presets.name,
        userId: presets.userId,
        parameters: presets.parameters,
        sequencerData: presets.sequencerData,
        slicesData: presets.slicesData,
        sampleId: presets.sampleId,
        isPublic: presets.isPublic,
        isFactory: presets.isFactory,
        createdAt: presets.createdAt,
        userEmail: users.email,
        username: users.username,
      })
      .from(presets)
      .leftJoin(users, eq(presets.userId, users.uid))
      .orderBy(desc(presets.createdAt));

    // 2. Samples
    const allSamples = await db
      .select({
        id: samples.id,
        userId: samples.userId,
        title: samples.title,
        url: samples.url,
        isPublic: samples.isPublic,
        isFactory: samples.isFactory,
        createdAt: samples.createdAt,
        userEmail: users.email,
        username: users.username,
      })
      .from(samples)
      .leftJoin(users, eq(samples.userId, users.uid))
      .orderBy(desc(samples.createdAt));

    // 3. Kits with Kit Samples
    const allKits = await db
      .select({
        id: kits.id,
        userId: kits.userId,
        name: kits.name,
        description: kits.description,
        coverImageUrl: kits.coverImageUrl,
        isPublic: kits.isPublic,
        isFactory: kits.isFactory,
        createdAt: kits.createdAt,
        userEmail: users.email,
        username: users.username,
      })
      .from(kits)
      .leftJoin(users, eq(kits.userId, users.uid))
      .orderBy(desc(kits.createdAt));

    const allKitSampleLinks = await db
      .select({
        kitId: kitSamples.kitId,
        sample: {
          id: samples.id,
          userId: samples.userId,
          title: samples.title,
          url: samples.url,
          isPublic: samples.isPublic,
          isFactory: samples.isFactory,
        },
      })
      .from(kitSamples)
      .innerJoin(samples, eq(kitSamples.sampleId, samples.id));

    // Group kit samples by kitId
    const kitSampleMap = new Map<string, any[]>();
    for (const link of allKitSampleLinks) {
      if (!kitSampleMap.has(link.kitId)) {
        kitSampleMap.set(link.kitId, []);
      }
      kitSampleMap.get(link.kitId)!.push(link.sample);
    }

    // Map presets to standard format
    const sampleLookup = new Map(allSamples.map(s => [s.id, s]));

    const mappedPresets = allPresets.map((p) => {
      const sample = p.sampleId ? sampleLookup.get(p.sampleId) : undefined;
      return {
        id: p.id,
        label: p.name || 'Untitled Preset',
        type: 'preset' as const,
        author: p.username || p.userEmail?.split('@')[0] || (p.userId ? `User ${p.userId.slice(0, 6)}` : 'Anon'),
        _userId: p.userId || undefined,
        isFactory: p.isFactory,
        isPublic: p.isPublic,
        data: {
          params: p.parameters || {},
          sequencer: p.sequencerData || { steps: [], stepCount: 16, mode: 'forward' },
          slices: p.slicesData || [],
          sampleUrl: sample?.url || '',
          sampleName: sample?.title || 'Unknown Sample',
          sampleId: p.sampleId,
        },
      };
    });

    const mapSample = (s: any) => ({
      id: s.id,
      label: s.title || 'Untitled Sample',
      type: 'sample' as const,
      url: s.url,
      author: s.username || s.userEmail?.split('@')[0] || (s.userId ? `User ${s.userId.slice(0, 6)}` : 'Anon'),
      _userId: s.userId || undefined,
      isFactory: s.isFactory,
      isPublic: s.isPublic,
    });

    const mappedSamples = allSamples.map(mapSample);

    const mappedKits = allKits.map((k) => {
      const children = (kitSampleMap.get(k.id) || []).map(mapSample);
      return {
        id: k.id,
        label: k.name,
        type: 'kit' as const,
        author: k.username || k.userEmail?.split('@')[0] || 'Anon',
        _userId: k.userId || undefined,
        isFactory: k.isFactory,
        isPublic: k.isPublic,
        description: k.description || undefined,
        imageUrl: k.coverImageUrl || undefined,
        data: { items: children },
      };
    });

    // Filtering categories
    const factoryPresets = mappedPresets.filter((p) => p.isFactory);
    const factorySamples = [...mappedKits.filter((k) => k.isFactory), ...mappedSamples.filter((s) => s.isFactory)];

    const userPresets = userId ? mappedPresets.filter((p) => p._userId === userId && !p.isFactory) : [];
    const userSamples = userId
      ? [...mappedKits.filter((k) => k._userId === userId && !k.isFactory), ...mappedSamples.filter((s) => s._userId === userId && !s.isFactory)]
      : [];

    const publicPresets = mappedPresets.filter((p) => !p.isFactory && (!userId || p._userId !== userId) && p.isPublic);
    const publicSamples = [
      ...mappedKits.filter((k) => !k.isFactory && (!userId || k._userId !== userId) && k.isPublic),
      ...mappedSamples.filter((s) => !s.isFactory && (!userId || s._userId !== userId) && s.isPublic),
    ];

    return {
      userPresets,
      publicPresets,
      factoryPresets,
      userSamples,
      publicSamples,
      factorySamples,
    };
  } catch (error) {
    console.error('Database query failed in fetchFullLibrary:', error);
    throw new Error('Failed to fetch library from database', { cause: error });
  }
}

export async function createPreset(data: {
  name: string;
  parameters: any;
  sequencerData: any;
  slicesData: any;
  userId: string;
  sampleId?: string;
  isFactory?: boolean;
  isPublic?: boolean;
}) {
  try {
    const id = randomUUID();
    const result = await db
      .insert(presets)
      .values({
        id,
        name: data.name,
        parameters: data.parameters,
        sequencerData: data.sequencerData,
        slicesData: data.slicesData,
        userId: data.userId,
        sampleId: data.sampleId || null,
        isFactory: data.isFactory || false,
        isPublic: data.isPublic || data.isFactory || false,
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in createPreset:', error);
    throw new Error('Failed to save preset to database', { cause: error });
  }
}

export async function updatePreset(
  id: string,
  userId: string,
  data: {
    name?: string;
    parameters?: any;
    sequencerData?: any;
    slicesData?: any;
    isPublic?: boolean;
  }
) {
  try {
    const valuesToUpdate: any = {};
    if (data.name !== undefined) valuesToUpdate.name = data.name;
    if (data.parameters !== undefined) valuesToUpdate.parameters = data.parameters;
    if (data.sequencerData !== undefined) valuesToUpdate.sequencerData = data.sequencerData;
    if (data.slicesData !== undefined) valuesToUpdate.slicesData = data.slicesData;
    if (data.isPublic !== undefined) valuesToUpdate.isPublic = data.isPublic;
    valuesToUpdate.createdAt = new Date();

    const result = await db
      .update(presets)
      .set(valuesToUpdate)
      .where(and(eq(presets.id, id), eq(presets.userId, userId)))
      .returning();

    return result[0] || null;
  } catch (error) {
    console.error('Database query failed in updatePreset:', error);
    throw new Error('Failed to update preset in database', { cause: error });
  }
}

export async function deletePreset(id: string, userId: string, isAdmin: boolean = false) {
  try {
    const condition = isAdmin ? eq(presets.id, id) : and(eq(presets.id, id), eq(presets.userId, userId));
    const result = await db
      .delete(presets)
      .where(condition)
      .returning();
    return result.length > 0;
  } catch (error) {
    console.error('Database query failed in deletePreset:', error);
    throw new Error('Failed to delete preset from database', { cause: error });
  }
}

export async function createSample(data: {
  id?: string;
  userId?: string;
  title: string;
  url: string;
  audioData?: string;
  isPublic?: boolean;
  isFactory?: boolean;
}) {
  try {
    const id = data.id || randomUUID();
    const result = await db
      .insert(samples)
      .values({
        id,
        userId: data.userId || null,
        title: data.title,
        url: data.url,
        audioData: data.audioData || null,
        isPublic: data.isPublic || data.isFactory || false,
        isFactory: data.isFactory || false,
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in createSample:', error);
    throw new Error('Failed to save sample to database', { cause: error });
  }
}

export async function deleteSample(id: string, userId: string, isAdmin: boolean = false) {
  try {
    const condition = isAdmin ? eq(samples.id, id) : and(eq(samples.id, id), eq(samples.userId, userId));
    
    // Fetch the sample first so we can return its URL for storage cleanup
    const found = await db.select().from(samples).where(condition).limit(1);
    if (!found || found.length === 0) {
      return null;
    }

    const result = await db
      .delete(samples)
      .where(condition)
      .returning();

    return result.length > 0 ? found[0] : null;
  } catch (error) {
    console.error('Database query failed in deleteSample:', error);
    throw new Error('Failed to delete sample from database', { cause: error });
  }
}

export async function deleteKit(id: string, userId: string, isAdmin: boolean = false, deleteSamples: boolean = false) {
  try {
    const condition = isAdmin ? eq(kits.id, id) : and(eq(kits.id, id), eq(kits.userId, userId));
    const foundKits = await db.select().from(kits).where(condition).limit(1);
    if (!foundKits || foundKits.length === 0) {
      return null;
    }

    const targetKit = foundKits[0];
    const deletedSampleUrls: string[] = [];

    // Find linked samples
    const linked = await db
      .select({
        sampleId: kitSamples.sampleId,
        url: samples.url,
      })
      .from(kitSamples)
      .leftJoin(samples, eq(kitSamples.sampleId, samples.id))
      .where(eq(kitSamples.kitId, id));

    const sampleIds = linked.map((l) => l.sampleId).filter(Boolean);
    linked.forEach((l) => {
      if (l.url) deletedSampleUrls.push(l.url);
    });

    // 1. Remove kit_samples links
    await db.delete(kitSamples).where(eq(kitSamples.kitId, id));

    // 2. If deleteSamples is requested and there are linked samples
    if (deleteSamples && sampleIds.length > 0) {
      await db.delete(samples).where(inArray(samples.id, sampleIds));
    }

    // 3. Remove kit from kits table
    const result = await db.delete(kits).where(eq(kits.id, id)).returning();

    return {
      kit: result[0] || targetKit,
      deletedSampleUrls,
    };
  } catch (error) {
    console.error('Database query failed in deleteKit:', error);
    throw new Error('Failed to delete kit from database', { cause: error });
  }
}

export async function createKit(data: {
  name: string;
  description?: string;
  coverImageUrl?: string;
  userId: string;
  isFactory?: boolean;
  isPublic?: boolean;
}) {
  try {
    const id = randomUUID();
    const result = await db
      .insert(kits)
      .values({
        id,
        name: data.name,
        description: data.description || null,
        coverImageUrl: data.coverImageUrl || null,
        userId: data.userId,
        isFactory: data.isFactory || false,
        isPublic: data.isPublic || data.isFactory || false,
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in createKit:', error);
    throw new Error('Failed to create kit in database', { cause: error });
  }
}

export async function linkSamplesToKit(kitId: string, sampleIds: string[]) {
  try {
    if (!sampleIds.length) return true;
    const values = sampleIds.map((sampleId) => ({
      kitId,
      sampleId,
    }));
    await db.insert(kitSamples).values(values);
    return true;
  } catch (error) {
    console.error('Database query failed in linkSamplesToKit:', error);
    throw new Error('Failed to link samples to kit', { cause: error });
  }
}

export async function renameItem(type: 'preset' | 'sample' | 'kit', id: string, newName: string, userId: string) {
  try {
    if (type === 'preset') {
      const result = await db
        .update(presets)
        .set({ name: newName })
        .where(and(eq(presets.id, id), eq(presets.userId, userId)))
        .returning();
      return result.length > 0;
    } else if (type === 'sample') {
      const result = await db
        .update(samples)
        .set({ title: newName })
        .where(and(eq(samples.id, id), eq(samples.userId, userId)))
        .returning();
      return result.length > 0;
    } else if (type === 'kit') {
      const result = await db
        .update(kits)
        .set({ name: newName })
        .where(and(eq(kits.id, id), eq(kits.userId, userId)))
        .returning();
      return result.length > 0;
    }
    return false;
  } catch (error) {
    console.error('Database query failed in renameItem:', error);
    throw new Error(`Failed to rename ${type}`, { cause: error });
  }
}

export async function createFeedback(data: {
  userId?: string;
  message: string;
  category: string;
}) {
  try {
    const result = await db
      .insert(feedback)
      .values({
        userId: data.userId || null,
        message: data.message,
        category: data.category,
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in createFeedback:', error);
    throw new Error('Failed to submit feedback to database', { cause: error });
  }
}

export async function getAllFeedback() {
  try {
    const result = await db
      .select({
        id: feedback.id,
        userId: feedback.userId,
        message: feedback.message,
        category: feedback.category,
        createdAt: feedback.createdAt,
        userEmail: users.email,
        username: users.username,
      })
      .from(feedback)
      .leftJoin(users, eq(feedback.userId, users.uid))
      .orderBy(desc(feedback.createdAt));

    return result.map((f) => ({
      id: String(f.id),
      user_id: f.userId || '',
      message: f.message,
      category: f.category as 'bug' | 'feature' | 'other',
      created_at: f.createdAt ? f.createdAt.toISOString() : new Date().toISOString(),
      profiles: {
        username: f.username || (f.userEmail ? f.userEmail.split('@')[0] : 'Anonymous'),
        email: f.userEmail || undefined,
      },
    }));
  } catch (error) {
    console.error('Database query failed in getAllFeedback:', error);
    throw new Error('Failed to fetch feedback list', { cause: error });
  }
}
