import { json } from '@sveltejs/kit';
import { getLatestNewsStories } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const category = url.searchParams.get('category') || undefined;
  const region = url.searchParams.get('region') || undefined;

  const stories = getLatestNewsStories(limit, category, region);

  return json({
    stories: stories.map((s: any) => ({
      story_id: s.story_id,
      title: s.title,
      short_summary: s.short_summary,
      category_name: s.category_name,
      emoji: s.emoji,
      image_url: s.image_url,
      image_caption: s.image_caption,
      quote: s.quote,
      quote_author: s.quote_author,
      published_at: s.published_at,
      language: s.language,
    })),
    count: stories.length,
  });
};
