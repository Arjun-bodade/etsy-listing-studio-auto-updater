import { z } from 'zod';
import { getGeminiSettings } from './ai-settings';

const outputSchema = z.object({
  title: z.string().min(1).max(140),
  description: z.string().min(1),
  keywordCandidates: z.array(z.string().min(1).max(20)).length(30),
  selectedTags: z.array(z.string().min(1).max(20)).length(13),
  suggestedCategory: z.string().default(''),
  altText: z.string().default('')
});

/** Uses Google's Gemini REST API directly; no OpenAI SDK or paid OpenAI API key required. */
export async function generateListing(payload: { imageBase64: string; mimeType: string; productName?: string; notes?: string }) {
  const savedSettings = await getGeminiSettings();
  const apiKey = savedSettings.apiKey || process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('Gemini API key is missing. Open Settings → AI content generation and save your key.');
  }

  const model = process.env.GEMINI_VISION_MODEL || savedSettings.model || 'gemini-2.5-flash';
  const prompt = `You create accurate Etsy digital-download listing drafts. Analyze the supplied main product image. Never invent dimensions, licensing rights, included files, editable features, printing details, or guarantees. Generate an appealing but accurate title (max 140 characters), useful buyer-focused description, exactly 30 distinct keyword/tag candidates each max 20 characters, and exactly 13 best tags each max 20 characters. Etsy supports only 13 tags. Avoid repeated tags and irrelevant keywords. Return only valid JSON with keys: title, description, keywordCandidates, selectedTags, suggestedCategory, altText.\n\nOptional product name: ${payload.productName || 'not provided'}. Seller notes: ${payload.notes || 'none'}. This is the main product PNG. Ensure exactly 30 candidates and 13 selected tags.`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const requestBody = JSON.stringify({
    contents: [{ role: 'user', parts: [
      { text: prompt },
      { inline_data: { mime_type: payload.mimeType || 'image/png', data: payload.imageBase64 } }
    ] }],
    generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
  });

  // Retry transient overload/rate-limit failures with bounded exponential backoff.
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody
    });
    if (response.ok || ![429, 502, 503, 504].includes(response.status) || attempt === 2) break;
    await new Promise(resolve => setTimeout(resolve, 1200 * (2 ** attempt)));
  }
  if (!response) throw new Error('Gemini request could not be started. Please try again.');

  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    const message = body?.error?.message || `Gemini API request failed (${response.status}).`;
    if (response.status === 400 || response.status === 403 || response.status === 404) {
      throw new Error(`Gemini API error: ${message}. Check that your API key is valid, the selected model is available, and your project has API access.`);
    }
    if (response.status === 429) throw new Error(`Gemini usage limit reached: ${message}. Wait and retry, or check the model's free-tier limits.`);
    throw new Error(`Gemini API error (${response.status}): ${message}`);
  }

  const raw = body?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('').trim();
  if (!raw) throw new Error('Gemini returned an empty response. Try again.');
  let json: unknown;
  try { json = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new Error('Gemini did not return valid JSON. Click Generate with AI to try again.'); }
  const parsed = outputSchema.safeParse(json);
  if (!parsed.success) throw new Error(`AI response did not match the expected listing format: ${parsed.error.issues.map(i => i.message).join(', ')}`);
  return parsed.data;
}
