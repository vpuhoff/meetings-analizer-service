/**
 * Citation formatting for the Responses API (new format).
 *
 * Unlike the Assistants API which uses text markers like 【6:0†file.md】,
 * the Responses API returns annotations with an `index` field indicating
 * the character position in the output text, plus `file_id` and `filename`.
 *
 * annotationsMap format: file_id → { index: number, filename: string }[]
 * (array per file_id because the same file can be cited multiple times)
 */

export interface CitationAnnotation {
  type: string;
  index: number;
  file_id: string;
  filename: string;
}

export type AnnotationsMapNew = Record<string, { index: number; filename: string }[]>;

/**
 * Build an AnnotationsMapNew from a raw annotations array.
 * Each file_id maps to an array of { index, filename } entries.
 */
export function buildAnnotationsMap(annotations: CitationAnnotation[]): AnnotationsMapNew {
  const map: AnnotationsMapNew = {};
  for (const ann of annotations) {
    if (ann.type === 'file_citation' && ann.file_id) {
      if (!map[ann.file_id]) map[ann.file_id] = [];
      map[ann.file_id].push({ index: ann.index, filename: ann.filename });
    }
  }
  return map;
}

/**
 * Insert citation markers into the text based on annotation indices.
 *
 * For each annotation, inserts ` [[N]](#file-{file_id})` at the annotation's
 * `index` position. Insertions are done from end to start so that earlier
 * indices remain valid.
 *
 * Sequential numbers are assigned per unique file_id so the same source
 * always gets the same badge number within a message.
 */
export function formatCitationsByIndex(
  text: string,
  annotations: CitationAnnotation[],
): string {
  if (!annotations.length) return text;

  // Assign sequential numbers per unique file_id
  const fileIdToIndex = new Map<string, number>();
  let counter = 0;
  for (const ann of annotations) {
    if (!fileIdToIndex.has(ann.file_id)) {
      fileIdToIndex.set(ann.file_id, ++counter);
    }
  }

  // Build insertion list: { position, marker }
  const insertions: { position: number; marker: string }[] = [];
  for (const ann of annotations) {
    const idx = fileIdToIndex.get(ann.file_id)!;
    insertions.push({
      position: ann.index,
      marker: ` [[${idx}]](#file-${ann.file_id})`,
    });
  }

  // Sort descending by position so insertions don't shift earlier indices
  insertions.sort((a, b) => b.position - a.position);

  let result = text;
  for (const { position, marker } of insertions) {
    const pos = Math.min(position, result.length);
    result = result.slice(0, pos) + marker + result.slice(pos);
  }

  return result;
}
