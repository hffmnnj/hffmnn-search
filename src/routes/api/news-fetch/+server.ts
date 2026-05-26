import { json, error } from '@sveltejs/kit';
import { saveNewsBatch, saveNewsStory, storyExists, setStoryEmbedding, getStoriesWithoutEmbedding } from '$lib/server/db';
import { embedText } from '$lib/server/embeddings';
import type { RequestHandler } from './$types';

const KAGI_API = 'https://news.kagi.com';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const batchId = body.batchId || '';
    const region = body.region || '';

    // Step 1: Get latest batch info
    const batchRes = await fetch(`${KAGI_API}/api/batches/${batchId || 'latest'}`);
    if (!batchRes.ok) throw error(502, 'Kagi API unavailable');
    const batch = await batchRes.json();

    saveNewsBatch(batch);

    // Step 2: Fetch categories for this batch
    const catRes = await fetch(`${KAGI_API}/api/batches/${batch.id}/categories`);
    if (!catRes.ok) throw error(502, 'Kagi categories API failed');
    const catData = await catRes.json();
    let categories = catData.categories || [];

    // Filter by region
    if (region === 'us') {
      const usIds = new Set([
        '096055dd-0212-4d6c-8fdc-c385f2d6fdb5', // USA
        '0060935d-fbd8-4eea-8426-22f69ba526e1', // USA | Texas
        'd9273c2f-90f4-4c75-aaab-6d5b9e46dbd9', // USA | Houston
        'b8ad0e91-501a-46f5-ab63-8cf28a5f7bba', // USA | Georgia
        'f7f88310-54bf-4403-999e-b684ddb36765', // USA | Austin
        'bc8ceb76-4ad7-4d33-9a8d-f5320c87ece9', // USA | Boston
        '27e81d8b-8af7-48b7-98cf-d50798f846da', // USA | Hawaii
        '66f6423d-b804-4e4c-b4a5-e78743afc469', // USA | Nebraska
        '8ba60956-9b46-499d-9b6e-1028428d1a2c', // USA | Nevada
        '20e1c56c-b017-4deb-87f3-77e1e7292fe5', // USA | Michigan
        '805e309b-a26a-4db4-9b41-1813d413a500', // USA | New Mexico
        '8f2bb203-73d4-44a5-8244-f9a614c1f276', // USA | New York City
        '310cd60b-f618-4f96-96b5-cda7fa3ee566', // USA | Colorado
        '5b1dad18-cd4d-4755-a487-74eedb78a047', // USA | Florida
        'bc1f2262-f447-46de-be77-c1bad252209d', // USA | Ohio
        '0ae80e17-ba9f-4dc4-b55d-e6d957d358eb', // USA | Chicago
        '32d502c9-69b3-4bea-b48c-db6646a7ca42', // USA | Utah
        'be85210d-32ea-467e-99f2-040b3bf5a96c', // USA | Minnesota
        '178c1b7b-898a-47f3-8230-683d05582c33', // USA | Washington
      ]);
      categories = categories.filter((c: any) => usIds.has(c.id) || c.sourceLanguage === 'en');
    }

    let savedStories = 0;
    let skippedStories = 0;

    // Step 3: For each category, fetch stories and save
    for (const cat of categories) {
      try {
        const storiesRes = await fetch(`${KAGI_API}/api/batches/${batch.id}/categories/${cat.id}/stories`);
        if (!storiesRes.ok) continue;
        const storiesData = await storiesRes.json();
        const stories = storiesData.stories || [];

        for (const story of stories) {
          if (storyExists(story.id)) {
            skippedStories++;
            continue;
          }

          const primaryImage = story.primary_image || {};

          saveNewsStory({
            batch_id: batch.id,
            story_id: story.id,
            category_id: cat.id,
            category_name: cat.categoryName || '',
            title: story.title || '',
            short_summary: story.short_summary || '',
            talking_points: story.talking_points ? JSON.stringify(story.talking_points) : null,
            quote: story.quote || '',
            quote_author: story.quote_author || '',
            perspectives: story.perspectives ? JSON.stringify(story.perspectives) : null,
            international_reactions: story.international_reactions ? JSON.stringify(story.international_reactions) : null,
            business_angle: story.business_angle || '',
            emoji: story.emoji || '',
            articles_json: story.articles ? JSON.stringify(story.articles) : null,
            language: story.sourceLanguage || cat.sourceLanguage || 'en',
            published_at: story.dateSlug || batch.dateSlug || '',
            image_url: primaryImage.url || '',
            image_caption: primaryImage.caption || '',
            embedding: null,
          });
          savedStories++;
        }
      } catch (e) {
        console.error('Category fetch failed:', cat.id, e);
      }
    }

    // Step 4: Vectorize all un-vectorized stories for this batch
    let vectorized = 0;
    let vectorizeErrors = 0;
    const pending = getStoriesWithoutEmbedding(200);

    for (const story of pending) {
      try {
        const text = buildEmbedText(story);
        const embedding = await embedText(text);
        setStoryEmbedding(story.story_id, JSON.stringify(embedding));
        vectorized++;
      } catch (e) {
        console.error('Vectorize failed for story:', story.story_id, e);
        vectorizeErrors++;
      }
    }

    return json({
      status: 'success',
      batchId: batch.id,
      dateSlug: batch.dateSlug,
      categories: categories.length,
      savedStories,
      skippedStories,
      vectorized,
      vectorizeErrors,
      pendingVectorization: getStoriesWithoutEmbedding(1).length,
    });
  } catch (e: any) {
    console.error('News fetch error:', e);
    throw error(500, e.message || 'News fetch failed');
  }
};

function buildEmbedText(story: any): string {
  const parts: string[] = [];
  if (story.title) parts.push(story.title);
  if (story.short_summary) parts.push(story.short_summary);
  if (story.talking_points) {
    try {
      const tp = JSON.parse(story.talking_points);
      if (Array.isArray(tp)) parts.push(tp.join('\n'));
    } catch { /* ignore */ }
  }
  if (story.business_angle) parts.push(story.business_angle);
  return parts.join('\n\n').slice(0, 8000);
}
