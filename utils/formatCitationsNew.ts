/**
 * Citation formatting for the Responses API (new format).
 *
 * The Responses API returns annotations with { index, file_id, filename }.
 * The model may embed citations in two ways:
 *   1. 【…】 markers (e.g. 【9:a73e160f-c48c-422c-a128-99e6aadc342e.md】)
 *   2. Bare filenames inline (e.g. "9df984cf-9c77-491b-a73b-b70f4bc0fdfe.md")
 *
 * This module replaces both with clickable [[N]](#file-{file_id}) links.
 */

export interface CitationAnnotation {
  type: string;
  index: number;
  file_id: string;
  filename: string;
}

// Regex for 【…】 markers
const BRACKET_MARKER_RE = /【[^】]*】/g;

// Regex for bare UUID.md filenames inline (e.g. a73e160f-c48c-422c-a128-99e6aadc342e.md)
const INLINE_MD_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.md\b/gi;

/**
 * Build a marker→file_id map from annotations by matching filenames.
 *
 * For each annotation, we look for its filename inside 【…】 markers
 * in the text. If found, the whole marker maps to the file_id.
 * If not found via brackets, we also map the bare filename → file_id.
 */
export function buildMarkerMap(
  text: string,
  annotations: CitationAnnotation[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const ann of annotations) {
    if (ann.type !== 'file_citation' || !ann.file_id) continue;
    const filename = ann.filename || '';

    // Try to find a 【…】 marker containing this filename
    const bracketMatch = text.match(new RegExp(`【[^】]*${escapeRegex(filename)}[^】]*】`));
    if (bracketMatch) {
      map[bracketMatch[0]] = ann.file_id;
    }

    // Also map the bare filename → file_id for inline references
    if (filename) {
      map[filename] = ann.file_id;
    }
  }
  return map;
}

/**
 * Replace all citation markers (both 【…】 and inline UUID.md) with
 * clickable [[N]](#file-{file_id}) links.
 *
 * Sequential numbers are assigned per unique file_id.
 */
export function formatCitationsNew(
  text: string,
  markerMap: Record<string, string>,
): string {
  if (!Object.keys(markerMap).length) return text;

  const fileIdToIndex = new Map<string, number>();
  let counter = 0;

  function getBadge(fileId: string): string {
    if (!fileIdToIndex.has(fileId)) {
      fileIdToIndex.set(fileId, ++counter);
    }
    const idx = fileIdToIndex.get(fileId)!;
    return ` [[${idx}]](#file-${fileId})`;
  }

  // Step 1: Replace 【…】 markers
  let result = text.replace(BRACKET_MARKER_RE, (marker) => {
    const fileId = markerMap[marker];
    if (fileId) return getBadge(fileId);
    // Marker not resolved — remove it silently
    return '';
  });

  // Step 2: Replace bare UUID.md filenames
  result = result.replace(INLINE_MD_RE, (filename) => {
    const fileId = markerMap[filename];
    if (fileId) return getBadge(fileId);
    // Not a known citation — leave as-is
    return filename;
  });

  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
