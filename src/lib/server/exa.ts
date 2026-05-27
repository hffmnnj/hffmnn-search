/**
 * Exa Websearch client — neural search API.
 *
 * Docs: https://docs.exa.ai/reference/search
 * Env: EXA_API_KEY
 */

const EXA_API_KEY = process.env.EXA_API_KEY || '';
const EXA_BASE_URL = 'https://api.exa.ai';

export function exaConfigured(): boolean {
	return !!EXA_API_KEY;
}

export async function exaWebSearch(params: {
	q: string;
	count?: number;
	useAutoprompt?: boolean;
	text?: boolean;
	startPublishedDate?: string;
	endPublishedDate?: string;
	includeDomains?: string[];
	excludeDomains?: string[];
}) {
	if (!exaConfigured()) {
		throw new Error('Exa API key not configured');
	}

	const res = await fetch(`${EXA_BASE_URL}/search`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${EXA_API_KEY}`,
			'x-api-key': EXA_API_KEY,
		},
		body: JSON.stringify({
			query: params.q,
			numResults: params.count || 10,
			useAutoprompt: params.useAutoprompt ?? true,
			text: params.text ?? true,
			...(params.startPublishedDate && { startPublishedDate: params.startPublishedDate }),
			...(params.endPublishedDate && { endPublishedDate: params.endPublishedDate }),
			...(params.includeDomains?.length && { includeDomains: params.includeDomains }),
			...(params.excludeDomains?.length && { excludeDomains: params.excludeDomains }),
		}),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Exa API ${res.status}: ${text}`);
	}

	return res.json();
}

export function normalizeExaResults(data: any): Array<{
	title: string;
	url: string;
	description: string;
	age?: string;
}> {
	return (data.results || []).map((r: any) => ({
		title: r.title || 'Untitled',
		url: r.url,
		description: r.text || r.summary || r.title || '',
		age: r.publishedDate ? formatAge(r.publishedDate) : undefined,
	}));
}

function formatAge(isoDate: string): string {
	const then = new Date(isoDate).getTime();
	const now = Date.now();
	const diff = now - then;
	const days = Math.floor(diff / 86400000);
	if (days < 1) return 'today';
	if (days === 1) return '1 day ago';
	if (days < 30) return `${days} days ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
	const years = Math.floor(months / 12);
	return `${years} year${years > 1 ? 's' : ''} ago`;
}
