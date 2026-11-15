/**
 * Sous-titres d'un média — la transcription d'une vidéo ou d'un vocal servie
 * en WebVTT, dans la langue du LECTEUR (#11329).
 *
 * La langue suit le Prisme (`/CLAUDE.md` § Prisme Linguistique, famille AUDIO) :
 * `resolvePrismTranslation()` descend le prisme ordonné sur le dépouillement
 * UNIQUE `transcriptTranslationTexts()`, et `null` sert l'original. Aucun
 * repli sur la première traduction venue.
 *
 * Une traduction n'a pas de chronologie propre qui colle à l'image : ses
 * `segments` éventuels décrivent la piste TTS, pas le média d'origine. Le texte
 * traduit se pose donc sur les segments de l'ORIGINAL : phrase pour phrase
 * quand la traduction en compte autant que l'original a de segments, sinon
 * ses mots répartis au prorata de la longueur de chaque segment.
 *
 * Les entrées sortent de colonnes `Json` Prisma : elles sont lues comme
 * `unknown` et gardées ici, pour qu'aucun appelant n'ait à caster.
 */
import { transcriptTranslationTexts } from '../types/attachment-audio.js';
import { resolvePrismTranslation } from './conversation-helpers.js';
import { normalizeLanguageForDedup } from './language-normalize.js';

export type SubtitleCue = {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
};

type Segment = SubtitleCue;

type Transcription = {
  readonly text: string;
  readonly language: string;
  readonly durationMs: number | null;
  readonly segments: readonly Segment[];
};

const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const readSegment = (raw: unknown): Segment | null => {
  if (!raw || typeof raw !== 'object') return null;
  const { text, startMs, endMs } = raw as Record<string, unknown>;
  if (typeof text !== 'string' || text.trim() === '') return null;
  if (!isFiniteNonNegative(startMs) || !isFiniteNonNegative(endMs) || endMs <= startMs) return null;
  return { startMs, endMs, text: text.trim() };
};

const readTranscription = (raw: unknown): Transcription | null => {
  if (!raw || typeof raw !== 'object') return null;
  const { text: plain, transcribedText, language, durationMs, segments } = raw as Record<string, unknown>;
  const text = typeof plain === 'string' ? plain : transcribedText;
  if (typeof text !== 'string' || text.trim() === '') return null;
  if (typeof language !== 'string' || language.trim() === '') return null;
  const parsed = Array.isArray(segments)
    ? segments.map(readSegment).filter((s): s is Segment => s !== null)
    : [];
  return {
    text: text.trim(),
    language,
    durationMs: isFiniteNonNegative(durationMs) && durationMs > 0 ? durationMs : null,
    segments: [...parsed].sort((a, b) => a.startMs - b.startMs),
  };
};

/**
 * La langue dans laquelle un lecteur reçoit les sous-titres : le premier rang
 * de son prisme servi, ou la langue d'origine. `null` s'il n'y a rien à servir.
 */
export function prismSubtitleLanguage(params: {
  readonly transcription: unknown;
  readonly translations: unknown;
  readonly preferredLanguages: readonly string[];
}): string | null {
  const transcription = readTranscription(params.transcription);
  if (!transcription) return null;
  const served = resolvePrismTranslation({
    translations: transcriptTranslationTexts(params.translations),
    originalLanguage: transcription.language,
    preferredLanguages: params.preferredLanguages,
  });
  return served?.language ?? transcription.language;
}

const SENTENCE = /[^.!?…。！？]+[.!?…。！？]+["»”’)\]]*|[^.!?…。！？]+$/gu;

const sentencesOf = (text: string): readonly string[] =>
  (text.match(SENTENCE) ?? []).map((s) => s.trim()).filter((s) => s !== '');

const spreadOver = (segments: readonly Segment[], text: string): readonly SubtitleCue[] => {
  const sentences = sentencesOf(text);
  if (sentences.length === segments.length) {
    return segments.map((segment, i) => ({ startMs: segment.startMs, endMs: segment.endMs, text: sentences[i] ?? '' }));
  }
  const words = text.split(/\s+/).filter((w) => w !== '');
  const weights = segments.map((s) => Math.max(1, s.text.length));
  const total = weights.reduce((a, b) => a + b, 0);
  const cumulative = weights.map((_, i) => weights.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const boundaries = cumulative.map((c, i) =>
    i === segments.length - 1 ? words.length : Math.round((words.length * c) / total));
  return segments
    .map((segment, i) => ({
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: words.slice(i === 0 ? 0 : boundaries[i - 1], boundaries[i]).join(' '),
    }))
    .filter((cue) => cue.text !== '');
};

const wholeSpan = (transcription: Transcription, text: string): readonly SubtitleCue[] => {
  const lastEnd = transcription.segments.at(-1)?.endMs ?? 0;
  const endMs = transcription.durationMs ?? lastEnd;
  return endMs > 0 ? [{ startMs: 0, endMs, text }] : [];
};

/**
 * Les repères d'une langue PRÉCISE : la transcription d'origine si c'est sa
 * langue, sinon sa traduction vivante. `null` quand la langue n'est pas servie.
 */
export function subtitleCuesFor(params: {
  readonly transcription: unknown;
  readonly translations: unknown;
  readonly language: string;
}): readonly SubtitleCue[] | null {
  const transcription = readTranscription(params.transcription);
  if (!transcription) return null;
  const wanted = normalizeLanguageForDedup(params.language);

  if (wanted === normalizeLanguageForDedup(transcription.language)) {
    return transcription.segments.length > 0
      ? transcription.segments
      : wholeSpan(transcription, transcription.text);
  }

  const translated = Object.entries(transcriptTranslationTexts(params.translations))
    .find(([lang]) => normalizeLanguageForDedup(lang) === wanted)?.[1];
  if (translated === undefined) return null;

  return transcription.segments.length > 0
    ? spreadOver(transcription.segments, translated.trim())
    : wholeSpan(transcription, translated.trim());
}

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

const timestamp = (ms: number): string => {
  const whole = Math.round(ms);
  const hours = Math.floor(whole / 3_600_000);
  const minutes = Math.floor((whole % 3_600_000) / 60_000);
  const seconds = Math.floor((whole % 60_000) / 1000);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(whole % 1000, 3)}`;
};

const escapeCueText = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, ' ');

/** Le fichier WebVTT (W3C) des repères donnés. */
export function webVtt(cues: readonly SubtitleCue[]): string {
  const blocks = cues.map((cue, i) =>
    `${i + 1}\n${timestamp(cue.startMs)} --> ${timestamp(cue.endMs)}\n${escapeCueText(cue.text)}\n`);
  return ['WEBVTT\n', ...blocks].join('\n');
}
