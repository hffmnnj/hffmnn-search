import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '';

export const GET: RequestHandler = async () => {
  if (!OLLAMA_API_KEY) {
    throw error(500, 'OLLAMA_API_KEY not configured');
  }

  try {
    const res = await fetch('https://ollama.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${OLLAMA_API_KEY}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama API ${res.status}: ${text}`);
    }

    const data = await res.json();

    // Normalize to a clean list
    const models = (data.data || []).map((m: any) => ({
      id: m.id,
      name: m.id.split(':')[0].replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      description: m.description || '',
      context_length: m.context_length || 8192,
    }));

    return json({ models });
  } catch (e: any) {
    console.error('Models fetch error:', e);
    throw error(500, e.message || 'Failed to fetch models');
  }
};
