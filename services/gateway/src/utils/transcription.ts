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

/**
 * An audio attachment should be (re)dispatched to the translator only if it is
 * audio AND has no usable transcription stored yet. This makes the audio
 * pipeline idempotent: a replayed handleAttachments (outbox retry, REST+socket
 * for the same message) won't re-run the expensive Whisper→NLLB→TTS work.
 */
export function shouldProcessAudioAttachment(att: {
  mimeType?: string | null;
  transcription?: unknown;
}): boolean {
  if (!att.mimeType || !att.mimeType.startsWith('audio/')) return false;
  const text =
    att.transcription && typeof att.transcription === 'object'
      ? (att.transcription as { text?: string | null }).text
      : null;
  return isBlankTranscriptionText(text);
}
