export {};
declare global {
  interface Window {
    etsyApp: {
      selectFolder: () => Promise<any>;
      scanFolder: (path: string) => Promise<any>;
      readBase64: (path: string) => Promise<{base64:string;mimeType:string}>;
      generateListing: (payload: any) => Promise<any>;
      getAISettingsStatus: () => Promise<{configured:boolean;model:string}>;
      saveGeminiAPIKey: (apiKey: string) => Promise<any>;
      clearGeminiAPIKey: () => Promise<any>;
      testGeminiAPIKey: (apiKey: string) => Promise<{valid:boolean;models:string[]}>;
      getEtsyStatus: () => Promise<any>;
      connectEtsy: (apiKey: string, sharedSecret: string) => Promise<any>;
      getEtsySettings: () => Promise<any>;
      createDraft: (listing: any) => Promise<any>;
      listRecords: () => Promise<any[]>;
      openExternal: (url: string) => Promise<void>;
      getUpdateAppInfo: () => Promise<{packaged:boolean;version:string}>;
      checkForUpdates: () => Promise<any>;
      downloadUpdate: () => Promise<any>;
      installUpdate: () => Promise<void>;
      onUpdateStatus: (callback: (status:any) => void) => () => void;
      onUploadProgress: (callback: (progress: any) => void) => () => void;
    };
  }
}
