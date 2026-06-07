import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const panelDir = path.join(projectRoot, 'src', 'panel');
export const runtimeHome = path.resolve(
  process.env.MY_COMPUTER_HOME || path.join(os.homedir(), '.my-computer'),
);
export const chatsDir = path.join(runtimeHome, 'chats');
export const configPath = path.join(runtimeHome, 'config.json');
export const eventsPath = path.join(runtimeHome, 'events.jsonl');
export const persistentMemoryPath = path.join(runtimeHome, 'persistent-memory.md');
export const profilesIndexPath = path.join(runtimeHome, 'profiles.json');

export function getProfileRuntimeHome(profileId = 'default') {
  const cleanId = sanitizeProfileId(profileId);
  return cleanId === 'default' ? runtimeHome : path.join(runtimeHome, 'profiles', cleanId);
}

function sanitizeProfileId(profileId) {
  const clean = String(profileId || 'default').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return clean || 'default';
}
