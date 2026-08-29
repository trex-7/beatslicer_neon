import { GoogleGenAI, Type } from '@google/genai';

export interface PatternStep {
  active: boolean;
  sliceIndex: number;
  ratchet: number;
}

export interface PatternGenerationRequest {
  model?: string; // 'gemini' | 'gemini-3.7-flash' | 'gemini-3.1-flash-lite' | 'gemini-3.1-pro-preview' | 'openai-gpt4o' | 'openai-gpt4o-mini' | 'claude' | 'deepseek' | etc.
  stepCount?: number;
  bars?: number; // 0.5, 1, 2, 4, 8 etc.
  slicesCount: number;
  sliceCategories?: {
    kicks: number[];
    snares: number[];
    hats: number[];
    percs: number[];
  };
  style?: string;
  description?: string;
  complexity?: number;
  bpm?: string | number;
  apiKey?: string;
}

export interface PatternGenerationResponse {
  pattern: PatternStep[];
  suggestedBpm?: number;
  modelUsed: string;
  bars?: number;
  stepCount?: number;
}

function cleanEnv(val?: string): string {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '').trim();
}

function resolveBpm(parsedBpm: any, inputBpm?: string | number, style?: string, description?: string): number {
  if (inputBpm) {
    const num = Number(inputBpm);
    if (!isNaN(num) && num >= 30 && num <= 300) return Math.round(num);
  }
  if (parsedBpm) {
    const num = Number(parsedBpm);
    if (!isNaN(num) && num >= 30 && num <= 300) return Math.round(num);
  }
  const combined = ((style || '') + ' ' + (description || '')).toLowerCase();
  if (combined.includes('dnb') || combined.includes('drum & bass') || combined.includes('jungle')) return 174;
  if (combined.includes('trap') || combined.includes('drill')) return 140;
  if (combined.includes('techno')) return 132;
  if (combined.includes('house') || combined.includes('edm')) return 126;
  if (combined.includes('garage') || combined.includes('2-step')) return 132;
  if (combined.includes('breakbeat')) return 134;
  if (combined.includes('synthwave')) return 110;
  if (combined.includes('reggaeton') || combined.includes('dembow') || combined.includes('afro')) return 100;
  if (combined.includes('lofi') || combined.includes('chill')) return 85;
  if (combined.includes('ambient')) return 80;
  return 92;
}

export async function generatePatternWithAI(
  req: PatternGenerationRequest
): Promise<PatternGenerationResponse> {
  const {
    model = 'gemini-3.7-flash',
    slicesCount = 8,
    sliceCategories = { kicks: [], snares: [], hats: [], percs: [] },
    style,
    description,
    complexity = 0.5,
    bpm,
    apiKey,
  } = req;

  // Resolve Bars and Step Count (1 Bar = 16 sixteenth-note steps)
  const resolvedBars = req.bars
    ? Number(req.bars)
    : req.stepCount
    ? Number(req.stepCount) / 16
    : 1;
  const stepCount = Math.max(4, Math.min(64, Math.round(resolvedBars * 16)));

  // Build the musical instruction prompt
  let prompt = `You are an expert music producer and drum programmer. Generate a dynamic ${resolvedBars}-bar (${stepCount}-step) rhythm pattern in 4/4 time on a sixteenth-note grid for a step sequencer. Step 1 is the primary downbeat (Bar 1 Beat 1).\n`;

  if (resolvedBars > 1) {
    prompt += `Musical Phrase & Form: Develop a cohesive ${resolvedBars}-bar musical progression. Introduce subtle syncopations, ghost hits in middle bars, and a dynamic drum fill/roll turnaround on the final bar.\n`;
  }

  if (style) {
    prompt += `Musical genre/style: ${style}.\n`;
  }
  if (description) {
    prompt += `Creative direction: ${description}.\n`;
  }
  const complexityLabel = complexity < 0.35 ? 'minimal/sparse' : complexity < 0.7 ? 'groovy/standard' : 'intricate/syncopated with ghost notes';
  prompt += `Complexity level: ${complexityLabel} (${Math.round(complexity * 100)}%).\n`;

  prompt += `Available slice indices: Total ${slicesCount} slices (0 to ${Math.max(0, slicesCount - 1)}).\n`;
  if (sliceCategories.kicks.length) prompt += `- Kicks (punchy downbeats): [${sliceCategories.kicks.join(', ')}]\n`;
  if (sliceCategories.snares.length) prompt += `- Snares/Claps (backbeats e.g. steps 5, 13): [${sliceCategories.snares.join(', ')}]\n`;
  if (sliceCategories.hats.length) prompt += `- Hi-Hats/Cymbals (rhythm & subdivision): [${sliceCategories.hats.join(', ')}]\n`;
  if (sliceCategories.percs.length) prompt += `- Percussion/FX (groove accents): [${sliceCategories.percs.join(', ')}]\n`;

  if (bpm) {
    prompt += `Target tempo: ${bpm} BPM.\n`;
  } else {
    prompt += `Suggest an ideal tempo (BPM) between 70 and 175 appropriate for this style.\n`;
  }

  // 1. Google Gemini Generation using @google/genai SDK
  if (model.startsWith('gemini') || model === 'default' || !model) {
    let effectiveGeminiKey =
      cleanEnv(apiKey) ||
      cleanEnv(process.env.GEMINI_API_KEY) ||
      cleanEnv(process.env.VITE_GEMINI_API_KEY);

    // If key is missing, seamlessly generate a professional genre-accurate algorithmic groove
    if (!effectiveGeminiKey) {
      console.log('[AI Pattern] No Gemini API key provided. Using Algorithmic Music-Theory Pattern Engine.');
      return generateAlgorithmicGroove({
        stepCount,
        bars: resolvedBars,
        slicesCount,
        sliceCategories,
        style,
        description,
        complexity,
        bpm,
      });
    }

    const ai = new GoogleGenAI({
      apiKey: effectiveGeminiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    let selectedModel = 'gemini-3.1-flash-lite';
    if (model === 'gemini-3.1-pro' || model === 'gemini-3.1-pro-preview' || model === 'gemini-pro') {
      selectedModel = 'gemini-3.1-pro-preview';
    } else if (model === 'gemini-3.7-flash') {
      selectedModel = 'gemini-3.7-flash';
    } else if (model === 'gemini-3.1-flash-lite' || model === 'gemini-lite' || model === 'gemini-flash-lite' || model === 'gemini' || model === 'default' || !model) {
      selectedModel = 'gemini-3.1-flash-lite';
    } else if (model.startsWith('gemini')) {
      selectedModel = model;
    }

    const candidateModels = [
      selectedModel,
      'gemini-3.1-flash-lite',
      'gemini-3.7-flash',
    ].filter((m, idx, arr) => arr.indexOf(m) === idx);

    let lastError: any = null;
    let response: any = null;
    let modelUsed = selectedModel;

    for (const candidate of candidateModels) {
      try {
        console.log(`[Gemini SDK] Calling generateContent with model: ${candidate}, bars: ${resolvedBars}, steps: ${stepCount}`);
        const callPromise = ai.models.generateContent({
          model: candidate,
          contents: prompt,
          config: {
            systemInstruction: `You are an elite music sequencer engine. Generate rhythmic patterns with realistic groove, syncopation, and musical structure.
Ensure that active steps use slice indices within 0 and ${Math.max(0, slicesCount - 1)}.
Ratchet must be an integer from 1 to 4 (1 = normal hit, 2 = 2x rolls, 3 = 3x triplet roll, 4 = 4x roll).
Return exactly ${stepCount} steps in the pattern array representing ${resolvedBars} bar(s) of sixteenth notes in 4/4 time.`,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                suggestedBpm: {
                  type: Type.INTEGER,
                  description: 'Suggested tempo in BPM (e.g. 120, 130, 140, 174)',
                },
                pattern: {
                  type: Type.ARRAY,
                  description: `Array of exactly ${stepCount} step objects`,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      active: { type: Type.BOOLEAN, description: 'Whether this step triggers a sound' },
                      sliceIndex: { type: Type.INTEGER, description: `Slice index to trigger (0 to ${Math.max(0, slicesCount - 1)})` },
                      ratchet: { type: Type.INTEGER, description: 'Trigger multiplier from 1 to 4' },
                    },
                    required: ['active', 'sliceIndex', 'ratchet'],
                  },
                },
              },
              required: ['pattern'],
            },
          },
        });

        // 7-second strict per-model timeout to avoid client hangs
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Model ${candidate} timed out after 7s`)), 7000)
        );

        response = (await Promise.race([callPromise, timeoutPromise])) as any;
        modelUsed = candidate;
        break; // Success!
      } catch (err: any) {
        console.warn(`[Gemini SDK] Candidate model ${candidate} failed:`, err.message || err);
        lastError = err;
        // Continue to next candidate model
      }
    }

    if (!response) {
      console.warn('[Gemini SDK] All Gemini models failed or key error. Falling back to algorithmic engine:', lastError?.message);
      return generateAlgorithmicGroove({
        stepCount,
        bars: resolvedBars,
        slicesCount,
        sliceCategories,
        style,
        description,
        complexity,
        bpm,
      });
    }

    const textOutput = response.text?.trim() || '';
    let parsed: any = {};
    try {
      parsed = JSON.parse(textOutput);
    } catch (parseErr) {
      const match = textOutput.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error('Failed to parse Gemini JSON output: ' + textOutput.slice(0, 200));
      }
    }

    const rawPattern: any[] = Array.isArray(parsed.pattern) ? parsed.pattern : [];
    const sanitizedPattern: PatternStep[] = [];

    for (let i = 0; i < stepCount; i++) {
      const step = rawPattern[i];
      if (step) {
        sanitizedPattern.push({
          active: Boolean(step.active),
          sliceIndex: Math.max(0, Math.min(slicesCount - 1, Number(step.sliceIndex) || 0)),
          ratchet: Math.max(1, Math.min(4, Math.round(Number(step.ratchet) || 1))),
        });
      } else {
        sanitizedPattern.push({ active: false, sliceIndex: 0, ratchet: 1 });
      }
    }

    return {
      pattern: sanitizedPattern,
      suggestedBpm: resolveBpm(parsed.suggestedBpm, bpm, style, description),
      modelUsed: modelUsed,
      bars: resolvedBars,
      stepCount,
    };
  }

  // 2. OpenAI Generation (GPT-4o, GPT-4o-mini, o3-mini)
  if (model.startsWith('openai') || model.startsWith('gpt')) {
    const effectiveOpenAIKey =
      cleanEnv(apiKey) ||
      cleanEnv(process.env.OPENAI_API_KEY) ||
      cleanEnv(process.env.VITE_OPENAI_API_KEY);

    if (!effectiveOpenAIKey) {
      throw new Error('OpenAI API key is required. Please provide it in the API Key field.');
    }

    let openAiModel = 'gpt-4o-mini';
    if (model === 'openai-gpt4' || model === 'openai-gpt4o' || model === 'gpt-4o') {
      openAiModel = 'gpt-4o';
    } else if (model === 'openai-o3-mini' || model === 'o3-mini') {
      openAiModel = 'o3-mini';
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${effectiveOpenAIKey}`,
      },
      body: JSON.stringify({
        model: openAiModel,
        messages: [
          {
            role: 'system',
            content: `You are an expert drum programmer. Return ONLY a valid JSON object with {"suggestedBpm": number, "pattern": [{"active": boolean, "sliceIndex": number (0 to ${Math.max(0, slicesCount - 1)}), "ratchet": number (1-4)}]} containing exactly ${stepCount} steps.`,
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API call failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    const rawPattern = Array.isArray(parsed.pattern) ? parsed.pattern : [];

    const sanitizedPattern: PatternStep[] = [];
    for (let i = 0; i < stepCount; i++) {
      const step = rawPattern[i];
      sanitizedPattern.push({
        active: Boolean(step?.active),
        sliceIndex: Math.max(0, Math.min(slicesCount - 1, Number(step?.sliceIndex) || 0)),
        ratchet: Math.max(1, Math.min(4, Math.round(Number(step?.ratchet) || 1))),
      });
    }

    return {
      pattern: sanitizedPattern,
      suggestedBpm: resolveBpm(parsed.suggestedBpm, bpm, style, description),
      modelUsed: openAiModel,
      bars: resolvedBars,
      stepCount,
    };
  }

  // 3. DeepSeek Generation (deepseek-chat, deepseek-reasoner)
  if (model.startsWith('deepseek')) {
    const effectiveDeepSeekKey =
      cleanEnv(apiKey) ||
      cleanEnv(process.env.DEEPSEEK_API_KEY) ||
      cleanEnv(process.env.VITE_DEEPSEEK_API_KEY);

    if (!effectiveDeepSeekKey) {
      throw new Error('DeepSeek API key is required. Please provide it in the API Key field.');
    }

    const deepseekModel = model === 'deepseek-reasoner' ? 'deepseek-reasoner' : 'deepseek-chat';

    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${effectiveDeepSeekKey}`,
      },
      body: JSON.stringify({
        model: deepseekModel,
        messages: [
          {
            role: 'system',
            content: `You are an expert drum programmer. Return ONLY a valid JSON object formatted as: {"suggestedBpm": number, "pattern": [{"active": boolean, "sliceIndex": number, "ratchet": number}]} with exactly ${stepCount} items. Slice indices must be 0 to ${Math.max(0, slicesCount - 1)}.`,
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`DeepSeek API call failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    const rawPattern = Array.isArray(parsed.pattern) ? parsed.pattern : [];

    const sanitizedPattern: PatternStep[] = [];
    for (let i = 0; i < stepCount; i++) {
      const step = rawPattern[i];
      sanitizedPattern.push({
        active: Boolean(step?.active),
        sliceIndex: Math.max(0, Math.min(slicesCount - 1, Number(step?.sliceIndex) || 0)),
        ratchet: Math.max(1, Math.min(4, Math.round(Number(step?.ratchet) || 1))),
      });
    }

    return {
      pattern: sanitizedPattern,
      suggestedBpm: resolveBpm(parsed.suggestedBpm, bpm, style, description),
      modelUsed: deepseekModel,
      bars: resolvedBars,
      stepCount,
    };
  }

  // 4. Anthropic Claude Generation (claude-3-5-sonnet, claude-3-5-haiku)
  if (model.startsWith('claude')) {
    const effectiveClaudeKey =
      cleanEnv(apiKey) ||
      cleanEnv(process.env.ANTHROPIC_API_KEY) ||
      cleanEnv(process.env.CLAUDE_API_KEY);

    if (!effectiveClaudeKey) {
      throw new Error('Claude API key is required. Please provide it in the API Key field.');
    }

    const claudeModel = model === 'claude-3-5-haiku' ? 'claude-3-5-haiku-20241022' : 'claude-3-5-sonnet-20241022';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': effectiveClaudeKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: claudeModel,
        max_tokens: 1000,
        system: `You are an expert drum programmer. Output ONLY raw valid JSON (no markdown formatting, no commentary) matching: {"suggestedBpm": number, "pattern": [{"active": boolean, "sliceIndex": number (0-${Math.max(0, slicesCount - 1)}), "ratchet": number (1-4)}]} containing ${stepCount} steps.`,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude API call failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const content = data.content?.[0]?.text || '{}';
    const match = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : content);
    const rawPattern = Array.isArray(parsed.pattern) ? parsed.pattern : [];

    const sanitizedPattern: PatternStep[] = [];
    for (let i = 0; i < stepCount; i++) {
      const step = rawPattern[i];
      sanitizedPattern.push({
        active: Boolean(step?.active),
        sliceIndex: Math.max(0, Math.min(slicesCount - 1, Number(step?.sliceIndex) || 0)),
        ratchet: Math.max(1, Math.min(4, Math.round(Number(step?.ratchet) || 1))),
      });
    }

    return {
      pattern: sanitizedPattern,
      suggestedBpm: resolveBpm(parsed.suggestedBpm, bpm, style, description),
      modelUsed: claudeModel,
      bars: resolvedBars,
      stepCount,
    };
  }

  if (model === 'algorithmic' || model === 'groove-engine') {
    return generateAlgorithmicGroove({
      stepCount,
      bars: resolvedBars,
      slicesCount,
      sliceCategories,
      style,
      description,
      complexity,
      bpm,
    });
  }

  // Fallback if unsupported model
  return generateAlgorithmicGroove({
    stepCount,
    bars: resolvedBars,
    slicesCount,
    sliceCategories,
    style,
    description,
    complexity,
    bpm,
  });
}

export function generateAlgorithmicGroove(options: {
  stepCount?: number;
  bars?: number;
  slicesCount: number;
  sliceCategories?: {
    kicks: number[];
    snares: number[];
    hats: number[];
    percs: number[];
  };
  style?: string;
  description?: string;
  complexity?: number;
  bpm?: string | number;
}): PatternGenerationResponse {
  const {
    slicesCount = 8,
    sliceCategories = { kicks: [], snares: [], hats: [], percs: [] },
    style = 'hiphop',
    description = '',
    complexity = 0.5,
    bpm,
  } = options;

  const resolvedBars = options.bars
    ? Number(options.bars)
    : options.stepCount
    ? Number(options.stepCount) / 16
    : 1;
  const stepCount = Math.max(4, Math.min(64, Math.round(resolvedBars * 16)));

  const kicks = sliceCategories.kicks.length > 0 ? sliceCategories.kicks : [0];
  const snares = sliceCategories.snares.length > 0 ? sliceCategories.snares : [1 % slicesCount];
  const hats = sliceCategories.hats.length > 0 ? sliceCategories.hats : [2 % slicesCount];
  const percs = sliceCategories.percs.length > 0 ? sliceCategories.percs : [3 % slicesCount];

  const pick = (arr: number[]) => (arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : 0);
  const pattern: PatternStep[] = Array(stepCount).fill(0).map(() => ({ active: false, sliceIndex: 0, ratchet: 1 }));

  const lowerStyle = (style + ' ' + description).toLowerCase();
  let suggestedBpm = bpm ? Number(bpm) : 120;

  if (lowerStyle.includes('trap') || lowerStyle.includes('drill')) {
    suggestedBpm = 140;
    // Multi-bar iteration
    const totalBars = Math.max(1, Math.round(stepCount / 16));
    for (let bar = 0; bar < totalBars; bar++) {
      const offset = bar * 16;
      if (offset < stepCount) pattern[offset] = { active: true, sliceIndex: pick(kicks), ratchet: 1 };
      if (offset + 7 < stepCount) pattern[offset + 7] = { active: true, sliceIndex: pick(kicks), ratchet: 1 };
      if (offset + 10 < stepCount) pattern[offset + 10] = { active: true, sliceIndex: pick(kicks), ratchet: 1 };
      // Snares on 4 and 12
      if (offset + 4 < stepCount) pattern[offset + 4] = { active: true, sliceIndex: pick(snares), ratchet: 1 };
      if (offset + 12 < stepCount) pattern[offset + 12] = { active: true, sliceIndex: pick(snares), ratchet: 1 };
      // Hats & rolls
      for (let s = 0; s < 16 && offset + s < stepCount; s += 2) {
        if (!pattern[offset + s].active || Math.random() < 0.3) {
          const isRoll = s >= 14 || (bar === totalBars - 1 && s >= 12);
          pattern[offset + s] = {
            active: true,
            sliceIndex: pick(hats),
            ratchet: isRoll ? 3 : Math.random() < complexity * 0.5 ? 2 : 1,
          };
        }
      }
    }
  } else if (lowerStyle.includes('house') || lowerStyle.includes('techno') || lowerStyle.includes('four-on-the-floor') || lowerStyle.includes('edm')) {
    suggestedBpm = 126;
    const totalBars = Math.max(1, Math.round(stepCount / 16));
    for (let bar = 0; bar < totalBars; bar++) {
      const offset = bar * 16;
      // 4-on-the-floor kick
      for (let k = 0; k < 16 && offset + k < stepCount; k += 4) {
        pattern[offset + k] = { active: true, sliceIndex: pick(kicks), ratchet: 1 };
      }
      // Snares / Claps on 4 & 12
      if (offset + 4 < stepCount) pattern[offset + 4] = { active: true, sliceIndex: pick(snares), ratchet: 1 };
      if (offset + 12 < stepCount) pattern[offset + 12] = { active: true, sliceIndex: pick(snares), ratchet: 1 };
      // Offbeat open hats on 2, 6, 10, 14
      for (let h = 2; h < 16 && offset + h < stepCount; h += 4) {
        pattern[offset + h] = { active: true, sliceIndex: pick(hats), ratchet: 1 };
      }
      // Ghost percs
      for (let p = 0; p < 16 && offset + p < stepCount; p++) {
        if (!pattern[offset + p].active && Math.random() < complexity * 0.35) {
          pattern[offset + p] = { active: true, sliceIndex: pick(percs), ratchet: 1 };
        }
      }
    }
  } else if (lowerStyle.includes('dnb') || lowerStyle.includes('drum & bass') || lowerStyle.includes('jungle')) {
    suggestedBpm = 174;
    const totalBars = Math.max(1, Math.round(stepCount / 16));
    for (let bar = 0; bar < totalBars; bar++) {
      const offset = bar * 16;
      if (offset < stepCount) pattern[offset] = { active: true, sliceIndex: pick(kicks), ratchet: 1 };
      if (offset + 4 < stepCount) pattern[offset + 4] = { active: true, sliceIndex: pick(snares), ratchet: 1 };
      if (offset + 10 < stepCount) pattern[offset + 10] = { active: true, sliceIndex: pick(kicks), ratchet: 1 };
      if (offset + 12 < stepCount) pattern[offset + 12] = { active: true, sliceIndex: pick(snares), ratchet: 1 };

      for (let s = 0; s < 16 && offset + s < stepCount; s++) {
        if (!pattern[offset + s].active) {
          const isRoll = s === 15 || (bar === totalBars - 1 && s >= 14);
          pattern[offset + s] = {
            active: Math.random() < 0.6 + complexity * 0.3,
            sliceIndex: isRoll ? pick(snares) : pick(hats),
            ratchet: isRoll ? 2 : 1,
          };
        }
      }
    }
  } else if (lowerStyle.includes('garage') || lowerStyle.includes('2-step') || lowerStyle.includes('ukg')) {
    suggestedBpm = 132;
    const totalBars = Math.max(1, Math.round(stepCount / 16));
    for (let bar = 0; bar < totalBars; bar++) {
      const offset = bar * 16;
      if (offset < stepCount) pattern[offset] = { active: true, sliceIndex: pick(kicks), ratchet: 1 };
      if (offset + 4 < stepCount) pattern[offset + 4] = { active: true, sliceIndex: pick(snares), ratchet: 1 };
      if (offset + 7 < stepCount) pattern[offset + 7] = { active: true, sliceIndex: pick(kicks), ratchet: 1 };
      if (offset + 12 < stepCount) pattern[offset + 12] = { active: true, sliceIndex: pick(snares), ratchet: 1 };

      for (let s = 0; s < 16 && offset + s < stepCount; s++) {
        if (!pattern[offset + s].active && (s % 2 === 1 || Math.random() < complexity * 0.5)) {
          pattern[offset + s] = { active: true, sliceIndex: pick(hats), ratchet: Math.random() < 0.2 ? 2 : 1 };
        }
      }
    }
  } else if (lowerStyle.includes('reggaeton') || lowerStyle.includes('dembow') || lowerStyle.includes('latin')) {
    suggestedBpm = 96;
    const totalBars = Math.max(1, Math.round(stepCount / 16));
    for (let bar = 0; bar < totalBars; bar++) {
      const offset = bar * 16;
      for (let k = 0; k < 16 && offset + k < stepCount; k += 4) {
        pattern[offset + k] = { active: true, sliceIndex: pick(kicks), ratchet: 1 };
      }
      [3, 6, 11, 14].forEach(d => {
        if (offset + d < stepCount) pattern[offset + d] = { active: true, sliceIndex: pick(snares), ratchet: 1 };
      });
    }
  } else {
    // Standard Hip Hop / Boom Bap / Funk
    suggestedBpm = 92;
    const totalBars = Math.max(1, Math.round(stepCount / 16));
    for (let bar = 0; bar < totalBars; bar++) {
      const offset = bar * 16;
      if (offset < stepCount) pattern[offset] = { active: true, sliceIndex: pick(kicks), ratchet: 1 };
      if (offset + 4 < stepCount) pattern[offset + 4] = { active: true, sliceIndex: pick(snares), ratchet: 1 };
      if (offset + 8 < stepCount && (bar % 2 === 1 || Math.random() < 0.7)) pattern[offset + 8] = { active: true, sliceIndex: pick(kicks), ratchet: 1 };
      if (offset + 10 < stepCount) pattern[offset + 10] = { active: true, sliceIndex: pick(kicks), ratchet: 1 };
      if (offset + 12 < stepCount) pattern[offset + 12] = { active: true, sliceIndex: pick(snares), ratchet: 1 };

      for (let s = 0; s < 16 && offset + s < stepCount; s++) {
        if (!pattern[offset + s].active && (s % 2 === 0 || Math.random() < complexity * 0.6)) {
          const isTurnaround = bar === totalBars - 1 && s >= 14;
          pattern[offset + s] = {
            active: true,
            sliceIndex: isTurnaround ? pick(snares) : Math.random() < 0.7 ? pick(hats) : pick(percs),
            ratchet: isTurnaround ? 2 : Math.random() < complexity * 0.3 ? 2 : 1,
          };
        }
      }
    }
  }

  return {
    pattern,
    suggestedBpm,
    modelUsed: 'Algorithmic Music-Theory Groove Engine',
    bars: resolvedBars,
    stepCount,
  };
}
