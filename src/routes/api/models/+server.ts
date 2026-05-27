import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { llmConfigured, llmListModels } from '$lib/server/llm';

export const GET: RequestHandler = async () => {
  if (!llmConfigured()) {
    throw error(500, 'LLM not configured. Set LLM_BASE_URL + LLM_API_KEY (or OLLAMA_API_KEY for Ollama Cloud).');
  }
  try {
    const models = await llmListModels();
    return json({ models });
  } catch (e: any) {
    console.error('Models fetch error:', e);
    throw error(500, e.message || 'Failed to fetch models');
  }
};
