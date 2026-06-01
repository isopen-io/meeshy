/**
 * A transcription is "blank" when it carries no usable speech: missing, empty,
 * whitespace-only, or the literal string "undefined"/"null" that leaked from
 * older empty-transcription records. Such transcriptions must not be persisted
 * or displayed — the audio is treated as having no transcription.
 */
export function isBlankTranscriptionText(text?: string | null): boolean {
  if (text === undefined || text === null) return true;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  const lowered = trimmed.toLowerCase();
  return lowered === 'undefined' || lowered === 'null';
}
