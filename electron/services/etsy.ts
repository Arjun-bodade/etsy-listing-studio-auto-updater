import { app, shell, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { URL } from 'node:url';
let settingsCache: any = null;
const settingsPath = () => path.join(app.getPath('userData'), 'etsy-settings.json');
export async function getEtsySettings(): Promise<any> { if (settingsCache) return settingsCache; try { const raw = await fs.readFile(settingsPath()); if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable.'); const decrypted = safeStorage.decryptString(raw); settingsCache = JSON.parse(decrypted); } catch { settingsCache = {}; } return settingsCache; }
export async function saveEtsySettings(patch: any) { const settings = { ...(await getEtsySettings()), ...patch }; if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure credential encryption is unavailable. Please use a supported Windows desktop session.'); settingsCache = settings; await fs.mkdir(path.dirname(settingsPath()), { recursive: true }); const encrypted = safeStorage.encryptString(JSON.stringify(settings)); await fs.writeFile(settingsPath(), encrypted, { mode: 0o600 }); }
export async function getEtsyStatus() { const s = await getEtsySettings(); return { configured: Boolean(s.apiKey && s.sharedSecret), connected: Boolean(s.accessToken), shopId: s.shopId || null }; }
export async function startEtsyAuth() {
  const s = await getEtsySettings(); if (!s.apiKey || !s.sharedSecret) throw new Error('Enter your Etsy API key and shared secret first.');
  const verifier = crypto.randomBytes(32).toString('base64url'); const challenge = crypto.createHash('sha256').update(verifier).digest('base64url'); const state = crypto.randomBytes(20).toString('hex');
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1:42817');
      if (url.pathname !== '/callback') { res.writeHead(404); res.end('Not found'); return; }
      if (url.searchParams.get('state') !== state) { res.writeHead(400); res.end('OAuth state mismatch. You can close this window.'); server.close(); return; }
      const code = url.searchParams.get('code'); if (!code) { res.writeHead(400); res.end('No authorization code returned.'); server.close(); return; }
      const tokenResponse = await fetch('https://api.etsy.com/v3/public/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: s.apiKey, redirect_uri: 'http://127.0.0.1:42817/callback', code, code_verifier: verifier }) });
      const tokenData: any = await tokenResponse.json(); if (!tokenResponse.ok) throw new Error(tokenData.error_description || tokenData.error || 'Etsy token exchange failed');
      await saveEtsySettings({ accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token, expiresAt: Date.now() + tokenData.expires_in * 1000 });
      res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<h2>Etsy connected.</h2><p>You can return to Etsy Listing Studio.</p>'); server.close();
    } catch (e: any) { res.writeHead(500); res.end(`Connection failed: ${String(e.message || e)}`); server.close(); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(42817, '127.0.0.1', resolve); });
  const authUrl = new URL('https://www.etsy.com/oauth/connect'); authUrl.searchParams.set('response_type', 'code'); authUrl.searchParams.set('client_id', s.apiKey); authUrl.searchParams.set('redirect_uri', 'http://127.0.0.1:42817/callback'); authUrl.searchParams.set('scope', 'listings_w'); authUrl.searchParams.set('state', state); authUrl.searchParams.set('code_challenge', challenge); authUrl.searchParams.set('code_challenge_method', 'S256');
  await shell.openExternal(authUrl.toString()); return { started: true };
}
async function etsyFetch(url: string, init: RequestInit = {}) {
  const s = await getEtsySettings(); if (!s.apiKey || !s.accessToken) throw new Error('Connect your Etsy shop in Settings before uploading.');
  const headers = new Headers(init.headers); headers.set('x-api-key', `${s.apiKey}:${s.sharedSecret}`); headers.set('Authorization', `Bearer ${s.accessToken}`);
  let response = await fetch(url, { ...init, headers });
  if (response.status === 401 && s.refreshToken) {
    const refreshed = await fetch('https://api.etsy.com/v3/public/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: s.apiKey, refresh_token: s.refreshToken }) });
    const data: any = await refreshed.json(); if (!refreshed.ok) throw new Error('Etsy authorization expired. Reconnect your shop in Settings.');
    await saveEtsySettings({ accessToken: data.access_token, refreshToken: data.refresh_token || s.refreshToken, expiresAt: Date.now() + data.expires_in * 1000 });
    headers.set('Authorization', `Bearer ${data.access_token}`); response = await fetch(url, { ...init, headers });
  }
  if (!response.ok) { const text = await response.text(); throw new Error(`Etsy API error (${response.status}): ${text.slice(0, 500)}`); }
  return response;
}
async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> { let last: any; for (let i=0;i<attempts;i++) { try { return await fn(); } catch (e: any) { last=e; const msg=String(e.message || e); if (/Etsy API error \((400|401|403|404)\)/.test(msg) || i===attempts-1) throw e; await new Promise(r=>setTimeout(r, 700 * Math.pow(2,i))); } } throw last; }
export async function createEtsyDraft(listing: any, progress: (p: any) => void | Promise<void>) {
  const s = await getEtsySettings(); const shopId = listing.shopId || s.shopId;
  if (!shopId) throw new Error('Shop ID is missing. Enter your numeric Etsy shop ID in Settings.');
  if (!listing.title || !listing.description || !listing.price || !listing.taxonomyId) throw new Error('Title, description, price and Etsy category/taxonomy ID are required.');
  if (!listing.downloadPath) throw new Error('Choose a digital download file before uploading.');
  const body = new URLSearchParams({ quantity: '999', title: listing.title, description: listing.description, price: String(listing.price), who_made: listing.whoMade || 'i_did', when_made: listing.whenMade || '2020_2026', is_supply: 'false', taxonomy_id: String(listing.taxonomyId), type: 'download' });
  for (const tag of (listing.tags || []).slice(0, 13)) body.append('tags[]', tag);
  const created = await retry(async () => { const r = await etsyFetch(`https://openapi.etsy.com/v3/application/shops/${encodeURIComponent(shopId)}/listings`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }); return r.json() as Promise<any>; });
  const listingId = created.listing_id; if (!listingId) throw new Error(`Etsy did not return a listing ID: ${JSON.stringify(created).slice(0,300)}`);
  await progress({ step: 'draft', current: 1, total: 1, listingId, message: `Draft created (${listingId}).` });
  const images = (listing.mockupPaths || []).slice(0,20); let completed = 0;
  for (const imagePath of images) { await retry(async () => { const bytes = await fs.readFile(imagePath); const form = new FormData(); form.append('image', new Blob([bytes]), path.basename(imagePath)); const r = await etsyFetch(`https://openapi.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/images`, { method: 'POST', body: form }); return r.json(); }); completed++; await progress({ step: 'images', current: completed, total: images.length, listingId, message: `Uploaded image ${completed} of ${images.length}` }); }
  const bytes = await fs.readFile(listing.downloadPath); const fileForm = new FormData(); fileForm.append('file', new Blob([bytes]), path.basename(listing.downloadPath)); fileForm.append('name', path.basename(listing.downloadPath)); fileForm.append('rank', '1');
  await retry(async () => { const r = await etsyFetch(`https://openapi.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/files`, { method: 'POST', body: fileForm }); return r.json(); });
  await progress({ step: 'complete', current: 1, total: 1, listingId, message: 'Draft images and digital file uploaded.' });
  return { listingId, url: `https://www.etsy.com/your/shops/me/tools/listings/${listingId}/edit`, status: 'draft' };
}
