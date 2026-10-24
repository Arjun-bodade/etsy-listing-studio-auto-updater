import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const filePath = () => path.join(app.getPath('userData'), 'listing-records.json');
async function readAll(): Promise<any[]> { try { return JSON.parse(await fs.readFile(filePath(), 'utf8')); } catch { return []; } }
async function writeAll(records: any[]) { const target = filePath(); await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.tmp`; await fs.writeFile(temp, JSON.stringify(records, null, 2), 'utf8'); await fs.rename(temp, target); }
export async function listRecords() { return readAll(); }
export async function saveRecord(record: any) { const records = await readAll(); const item = { ...record, id: crypto.randomUUID() }; records.unshift(item); await writeAll(records); return item; }
export async function updateRecord(id: string, patch: any) { const records = await readAll(); const index = records.findIndex(r => r.id === id); if (index < 0) return; records[index] = { ...records[index], ...patch }; await writeAll(records); }
