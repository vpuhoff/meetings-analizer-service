// Regex matching OpenAI file_citation markers, e.g. 【6:0†TDK_v2.md】
const CITATION_RE = /【.*?】/g;

/**
 * Replace OpenAI citation markers with Markdown link syntax understood by
 * the custom `a` renderer in ChatMessage.
 *
 * Sequential numbers are assigned per unique file_id so the same source
 * always gets the same badge number within a message.
 *
 * If a marker hasn't been resolved in annotationsMap yet (stream lag),
 * the marker is silently removed to avoid showing raw 【…】 text.
 */
export function formatCitationsWithIds(
  text: string,
  annotationsMap: Record<string, string>,
): string {
  const fileIdToIndex = new Map<string, number>();
  let counter = 0;

  return text.replace(CITATION_RE, (marker) => {
    const fileId = annotationsMap[marker];
    if (!fileId) return '';

    if (!fileIdToIndex.has(fileId)) {
      fileIdToIndex.set(fileId, ++counter);
    }
    const idx = fileIdToIndex.get(fileId)!;
    return ` [[${idx}]](#file-${fileId})`;
  });
}
