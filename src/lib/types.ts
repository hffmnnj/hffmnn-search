export interface WebResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  favicon?: string;
}

export interface NewsResult {
  title: string;
  url: string;
  description: string;
  age: string;
  source?: string;
  image?: string;
}

export interface SearchResponse {
  query: string;
  results: WebResult[];
  total?: number;
  offset: number;
  count: number;
  summaryKey?: string;
  relatedQueries?: string[];
}

export interface NewsResponse {
  query: string;
  results: NewsResult[];
  offset: number;
  count: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  searched?: boolean;
}

export interface DomainPreference {
  domain: string;
  preference: 'pin' | 'block' | 'normal';
}

export interface AIModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
}
