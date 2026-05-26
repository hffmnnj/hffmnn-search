// Lightweight markdown-to-HTML renderer for AI responses
// Handles: bold, italic, links, lists, paragraphs, line breaks

export function mdToHtml(text: string): string {
  if (!text) return '';

  // Escape HTML first (basic)
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic: *text* (but not inside bold which is already processed)
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="underline hover:opacity-80">$1</a>');

  // Split into blocks for paragraph/list processing
  const lines = html.split('\n');
  const blocks: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // List item: - item or * item or 1. item
    const listMatch = trimmed.match(/^(?:[-*]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      if (!inList) {
        blocks.push('<ul class="list-disc pl-4 my-1 space-y-0.5">');
        inList = true;
      }
      blocks.push(`<li>${listMatch[1]}</li>`);
      continue;
    }

    if (inList) {
      blocks.push('</ul>');
      inList = false;
    }

    // Heading: ### text
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const sizeClass = level === 1 ? 'text-base font-bold' : level === 2 ? 'text-sm font-semibold' : 'text-xs font-semibold';
      blocks.push(`<h${level + 1} class="${sizeClass} mt-3 mb-1.5">${headingMatch[2]}</h${level + 1}>`);
      continue;
    }

    // Default: paragraph
    blocks.push(`<p class="my-1">${trimmed}</p>`);
  }

  if (inList) blocks.push('</ul>');

  return blocks.join('');
}
