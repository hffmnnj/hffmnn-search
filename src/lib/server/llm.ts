/**
 * Unified LLM client — supports Ollama Cloud and any OpenAI/Anthropic-compatible endpoint.
 *
 * Env vars (in priority order):
 *   LLM_BASE_URL — API base URL (e.g. https://api.openai.com/v1, https://ollama.com/v1)
 *   LLM_API_KEY  — Bearer token
 *   LLM_MODEL    — Default model slug (optional)
 *
 * Fallback: if LLM_BASE_URL is unset but OLLAMA_API_KEY is set, uses Ollama Cloud.
 */

const LLM_BASE_URL = (process.env.LLM_BASE_URL || '').replace(/\/$/, '');
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || '';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '';

const BASE_URL = LLM_BASE_URL || (OLLAMA_API_KEY ? 'https://ollama.com/v1' : '');
const API_KEY = LLM_API_KEY || OLLAMA_API_KEY;

export function llmConfigured(): boolean {
	return !!(BASE_URL && API_KEY);
}

export function getLlmConfig() {
	return { baseUrl: BASE_URL, apiKey: API_KEY, defaultModel: LLM_MODEL };
}

export function getDefaultModel(fallback = 'gemma4:31b-cloud'): string {
	return LLM_MODEL || fallback;
}

export async function llmChatCompletion(options: {
	model?: string;
	messages: any[];
	tools?: any[];
	stream?: boolean;
	temperature?: number;
	max_tokens?: number;
}) {
	if (!llmConfigured()) {
		throw new Error('LLM not configured. Set LLM_BASE_URL + LLM_API_KEY (or OLLAMA_API_KEY for Ollama Cloud).');
	}

	const body: Record<string, any> = {
		model: options.model || getDefaultModel(),
		messages: options.messages,
		stream: options.stream ?? false,
	};

	if (options.tools && options.tools.length > 0) {
		body.tools = options.tools;
	}
	if (options.temperature !== undefined) {
		body.temperature = options.temperature;
	}
	if (options.max_tokens !== undefined) {
		body.max_tokens = options.max_tokens;
	}

	const res = await fetch(`${BASE_URL}/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${API_KEY}`,
		},
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`LLM API ${res.status}: ${text}`);
	}

	return res.json();
}

export async function llmListModels() {
	if (!llmConfigured()) {
		return [];
	}

	const res = await fetch(`${BASE_URL}/models`, {
		headers: { Authorization: `Bearer ${API_KEY}` },
	});

	if (!res.ok) {
		return [];
	}

	const data = await res.json();
	return (data.data || []).map((m: any) => ({
		id: m.id,
		name: m.id.split(':')[0].replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
		description: m.description || '',
		context_length: m.context_length || 8192,
	}));
}
