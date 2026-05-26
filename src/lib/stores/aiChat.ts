import { browser } from '$app/environment';
import type { ChatMessage } from '$lib/types';

const STORAGE_KEY = 'hffmnn-chat';
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface ChatStore {
  messages: ChatMessage[];
  model: string;
  expiresAt: number;
}

function load(): ChatStore {
  if (!browser) return { messages: [], model: 'gemma4:31b-cloud', expiresAt: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { messages: [], model: 'gemma4:31b-cloud', expiresAt: 0 };
    const data: ChatStore = JSON.parse(raw);
    if (Date.now() > data.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return { messages: [], model: 'gemma4:31b-cloud', expiresAt: 0 };
    }
    return data;
  } catch {
    return { messages: [], model: 'gemma4:31b-cloud', expiresAt: 0 };
  }
}

function save(data: ChatStore) {
  if (!browser) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getMessages(): ChatMessage[] {
  return load().messages;
}

export function getModel(): string {
  return load().model;
}

export function setModel(model: string) {
  const data = load();
  data.model = model;
  save(data);
}

export function addMessage(msg: ChatMessage) {
  const data = load();
  data.messages.push(msg);
  data.expiresAt = Date.now() + EXPIRY_MS;
  save(data);
}

export function clearHistory() {
  if (!browser) return;
  localStorage.removeItem(STORAGE_KEY);
}
