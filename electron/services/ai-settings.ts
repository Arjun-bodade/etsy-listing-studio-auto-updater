import { app, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

type AISettings = { apiKey?: string; model?: string };
const settingsPath = () => path.join(app.getPath('userData'), 'ai-settings.bin');

async function readSettings(): Promise<AISettings> {
  try {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is unavailable on this Windows session.');
    const encrypted = await fs.readFile(settingsPath());
    return JSON.parse(safeStorage.decryptString(encrypted)) as AISettings;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

export async function getAISettingsStatus() {
  const settings = await readSettings();
  return { configured: Boolean(settings.apiKey), model: settings.model || 'gemini-2.5-flash' };
}

export async function getGeminiSettings(): Promise<Required<AISettings>> {
  const settings = await readSettings();
  return { apiKey: settings.apiKey || '', model: settings.model || 'gemini-2.5-flash' };
}

export async function saveGeminiAPIKey(apiKey: string) {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error('Paste your Gemini API key first.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable. Please use a supported Windows desktop session.');
  const existing = await readSettings().catch(() => ({} as AISettings));
  const next = { ...existing, apiKey: trimmed, model: existing.model || 'gemini-2.5-flash' };
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), safeStorage.encryptString(JSON.stringify(next)), { mode: 0o600 });
  return { configured: true, model: next.model };
}

export async function clearGeminiAPIKey() {
  const existing = await readSettings().catch(() => ({} as AISettings));
  delete existing.apiKey;
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable.');
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), safeStorage.encryptString(JSON.stringify(existing)), { mode: 0o600 });
  return { configured: false, model: existing.model || 'gemini-2.5-flash' };
}
