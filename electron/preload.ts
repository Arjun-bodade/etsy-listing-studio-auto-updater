import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('etsyApp', {
  selectFolder: () => ipcRenderer.invoke('folder:select'),
  selectFolders: () => ipcRenderer.invoke('folder:select-many'),
  scanFolder: (path: string) => ipcRenderer.invoke('folder:scan', path),
  readBase64: (path: string) => ipcRenderer.invoke('file:read-base64', path),
  generateListing: (payload: unknown) => ipcRenderer.invoke('ai:generate', payload),
  getEtsyStatus: () => ipcRenderer.invoke('etsy:status'),
  connectEtsy: (apiKey: string, sharedSecret: string) => ipcRenderer.invoke('etsy:connect', apiKey, sharedSecret),
  getEtsySettings: () => ipcRenderer.invoke('etsy:settings'),
  createDraft: (listing: unknown) => ipcRenderer.invoke('etsy:create-draft', listing),
  listRecords: () => ipcRenderer.invoke('records:list'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  getUpdateAppInfo: () => ipcRenderer.invoke('app:update-status'),
  checkForUpdates: () => ipcRenderer.invoke('app:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('app:update-download'),
  installUpdate: () => ipcRenderer.invoke('app:update-install'),
  onUpdateStatus: (callback: (status: any) => void) => { const listener = (_event: unknown, status: any) => callback(status); ipcRenderer.on('app:update-status', listener); return () => ipcRenderer.removeListener('app:update-status', listener); },
  onUploadProgress: (callback: (progress: {step:string; current?:number; total?:number; message:string}) => void) => {
    const listener = (_event: unknown, progress: any) => callback(progress);
    ipcRenderer.on('etsy:progress', listener);
    return () => ipcRenderer.removeListener('etsy:progress', listener);
  }
});
