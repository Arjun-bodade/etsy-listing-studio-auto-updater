import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { startEtsyAuth, getEtsyStatus, saveEtsySettings, getEtsySettings, createEtsyDraft } from './services/etsy';
import { generateListing } from './services/ai';
import { saveRecord, listRecords, updateRecord } from './services/store';

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
function createWindow() {
  mainWindow = new BrowserWindow({ width: 1440, height: 940, minWidth: 1080, minHeight: 720, backgroundColor: '#101114', title: 'Etsy Listing Studio', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  if (isDev) mainWindow.loadURL('http://127.0.0.1:5173'); else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
}
app.whenReady().then(() => {
  registerIpc();
  createWindow();
  if (app.isPackaged) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => sendUpdaterStatus({ state: 'checking', message: 'Checking for updates…' }));
    autoUpdater.on('update-available', info => sendUpdaterStatus({ state: 'available', version: info.version, message: `Version ${info.version} is available.` }));
    autoUpdater.on('update-not-available', info => sendUpdaterStatus({ state: 'current', version: info.version, message: 'You are using the latest version.' }));
    autoUpdater.on('download-progress', progress => sendUpdaterStatus({ state: 'downloading', percent: Math.round(progress.percent), message: `Downloading update: ${Math.round(progress.percent)}%` }));
    autoUpdater.on('update-downloaded', info => sendUpdaterStatus({ state: 'downloaded', version: info.version, message: `Version ${info.version} is ready to install.` }));
    autoUpdater.on('error', error => sendUpdaterStatus({ state: 'error', message: `Update error: ${error.message}` }));
    setTimeout(() => { void autoUpdater.checkForUpdates().catch(() => undefined); }, 4000);
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
function sendUpdaterStatus(status: any) { mainWindow?.webContents.send('app:update-status', status); }

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

function registerIpc() {
  ipcMain.handle('folder:select', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    return scanFolder(result.filePaths[0]);
  });
  ipcMain.handle('folder:select-many', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'multiSelections'] });
    if (result.canceled || !result.filePaths.length) return [];
    const products = await Promise.all(result.filePaths.map(folder => scanFolder(folder)));
    return products;
  });
  ipcMain.handle('folder:scan', async (_e, folderPath: string) => scanFolder(folderPath));
  ipcMain.handle('file:read-base64', async (_e, filePath: string) => {
    const buffer = await fs.readFile(filePath);
    return { base64: buffer.toString('base64'), mimeType: mimeFromPath(filePath) };
  });
  ipcMain.handle('ai:generate', async (_e, payload) => generateListing(payload));
  ipcMain.handle('etsy:status', async () => getEtsyStatus());
  ipcMain.handle('etsy:connect', async (_e, apiKey: string, sharedSecret: string) => { await saveEtsySettings({ apiKey, sharedSecret }); return startEtsyAuth(); });
  ipcMain.handle('etsy:settings', async () => { const s = await getEtsySettings(); return { configured: Boolean(s.apiKey && s.sharedSecret), connected: Boolean(s.accessToken) }; });
  ipcMain.handle('etsy:create-draft', async (_e, listing) => {
    const existing = (await listRecords()).find((r: any) => r.fingerprint === listing.fingerprint && r.etsyListingId);
    if (existing) throw new Error(`This product already has an Etsy listing ID (${existing.etsyListingId}). Open the existing record instead of creating a duplicate.`);
    const record = await saveRecord({ ...listing, status: 'uploading', createdAt: new Date().toISOString() });
    try {
      const result = await createEtsyDraft(listing, async (progress) => {
        if (progress.listingId) await updateRecord(record.id, { etsyListingId: progress.listingId, status: 'draft-created-uploading-assets' });
        mainWindow?.webContents.send('etsy:progress', progress);
      });
      await updateRecord(record.id, { status: 'draft-created', etsyListingId: result.listingId, uploadCompletedAt: new Date().toISOString() });
      return result;
    } catch (error: any) {
      await updateRecord(record.id, { status: 'upload-failed', error: error?.message || 'Upload failed' });
      throw error;
    }
  });
  ipcMain.handle('records:list', async () => listRecords());
  ipcMain.handle('app:open-external', async (_e, url: string) => { if (url.startsWith('https://')) await shell.openExternal(url); });
  ipcMain.handle('app:update-status', async () => ({ packaged: app.isPackaged, version: app.getVersion() }));
  ipcMain.handle('app:update-check', async () => {
    if (!app.isPackaged) return { state: 'dev', message: 'Automatic updates are available in the installed Windows version.' };
    await autoUpdater.checkForUpdates();
    return { state: 'checking', message: 'Checking for updates…' };
  });
  ipcMain.handle('app:update-download', async () => {
    if (!app.isPackaged) throw new Error('Install the packaged Windows version to use automatic updates.');
    await autoUpdater.downloadUpdate();
    return { state: 'downloading', message: 'Downloading update…' };
  });
  ipcMain.handle('app:update-install', async () => {
    if (!app.isPackaged) throw new Error('Automatic updates are available in the installed Windows version.');
    autoUpdater.quitAndInstall();
  });
}

async function scanFolder(folderPath: string) {
  const stat = await fs.stat(folderPath); if (!stat.isDirectory()) throw new Error('Select a folder, not a file.');
  const names = await fs.readdir(folderPath, { withFileTypes: true });
  const files = [] as Array<{name:string; path:string; size:number; mimeType:string; kind:string; previewUrl:string}>;
  for (const entry of names) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(folderPath, entry.name); const ext = path.extname(entry.name).toLowerCase();
    if (!['.png','.jpg','.jpeg','.webp','.gif','.pdf','.zip','.svg'].includes(ext)) continue;
    const info = await fs.stat(fullPath); const mimeType = mimeFromPath(fullPath);
    const isImage = ['.png','.jpg','.jpeg','.webp','.gif'].includes(ext);
    const previewUrl = isImage && info.size <= 5 * 1024 * 1024 ? `data:${mimeType};base64,${(await fs.readFile(fullPath)).toString('base64')}` : '';
    files.push({ name: entry.name, path: fullPath, size: info.size, mimeType, kind: isImage ? 'image' : 'download', previewUrl });
  }
  files.sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const imageFiles = files.filter(f => f.kind === 'image');
  const preferredNames = /^(master|main|design|artwork|original|print|printable|final)([-_ ]?\d+)?\.(png|jpg|jpeg|webp)$/i;
  const main = imageFiles.find(f => preferredNames.test(f.name))
    || imageFiles.filter(f => /\.png$/i.test(f.name)).sort((a,b) => {
      const score = (f: typeof a) => (/(master|main|design|artwork|original|print|printable|final)/i.test(f.name) ? 100 : 0) + (f.previewUrl ? 10 : 0) - Math.min(f.size / (1024 * 1024), 20);
      return score(b) - score(a);
    })[0]
    || imageFiles[0];
  const images = files.filter(f => f.kind === 'image');
  const mockups = images.filter(f => f.path !== main?.path);
  const downloadFile = main;
  const fingerprintHash = crypto.createHash('sha256');
  for (const file of files) {
    fingerprintHash.update(file.name);
    fingerprintHash.update(':');
    fingerprintHash.update(await hashFile(file.path));
    fingerprintHash.update('|');
  }
  const fingerprint = fingerprintHash.digest('hex');
  return { folderPath, folderName: path.basename(folderPath), files, mainImage: main || null, mockups, downloadFile: downloadFile || null, fingerprint, warnings: [!main ? 'No PNG or image found. Choose a main image manually.' : '', mockups.length > 20 ? `Found ${mockups.length} mockups. Etsy supports up to 20 listing images; only the first 20 will be used.` : '', !downloadFile ? 'No digital download file found.' : '', downloadFile && downloadFile.size > 20*1024*1024 ? 'The main file exceeds Etsy’s 20 MB per-file limit for instant downloads.' : ''].filter(Boolean) };
}
async function hashFile(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  const stream = (await import('node:fs')).createReadStream(filePath);
  await new Promise<void>((resolve, reject) => { stream.on('data', chunk => hash.update(chunk)); stream.on('end', resolve); stream.on('error', reject); });
  return hash.digest('hex');
}
function mimeFromPath(filePath: string) { const ext = path.extname(filePath).toLowerCase(); return ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.pdf':'application/pdf','.zip':'application/zip','.svg':'image/svg+xml'} as Record<string,string>)[ext] || 'application/octet-stream'; }
