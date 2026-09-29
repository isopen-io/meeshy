import * as z from 'zod/mini';
import * as callsEndpoints from '@meeshy/shared/api/endpoints/calls';

import type { CallsDeps } from '@/lib/api/calls';
import type { ApiResult } from '@/lib/api/http';
import { served } from '@/lib/api/prism';

/**
 * **LA TRANSCRIPTION D'APRÈS L'APPEL** (#8048, G6) — `GET
 * calls.byCallIdTranscript` (`calls-consultation.ts`), le journal que la
 * passerelle a GRAVÉ pendant l'appel (segments finaux et leurs traductions),
 * relu dans la bulle d'appel du fil comme iOS le relit dans
 * `CallSummaryDetailSheet` (`BubbleCallNoticeView.swift`). Donnée SENSIBLE : la
 * passerelle ne la sert qu'aux participants EFFECTIFS ; un refus se dit
 * « indisponible », sans détail.
 *
 * La ligne d'un autre descend le PRISME du lecteur (`served`, la descente de
 * `resolvePrismTranslation`) : rang par rang, traduction ou original déjà dans
 * la langue — jamais `translations[0]`. Ma parole reste la mienne.
 */

const WireTranslation = z.object({ targetLanguage: z.string(), translatedText: z.string() });

const WireSegment = z.object({
  id: z.string(),
  speakerId: z.string(),
  speakerDisplayName: z.optional(z.nullable(z.string())),
  text: z.string(),
  language: z.string(),
  capturedAtMs: z.number(),
  translations: z.optional(z.nullable(z.array(WireTranslation))),
});

const WireTranscript = z.object({
  callId: z.string(),
  callStartedAt: z.optional(z.nullable(z.string())),
  segments: z.array(z.unknown()),
});

export type TranscriptSegment = z.infer<typeof WireSegment>;

export type CallTranscript = { readonly callId: string; readonly startedAtMs: number | null; readonly segments: readonly TranscriptSegment[] };

export type TranscriptLine = {
  readonly id: string;
  readonly speakerId: string;
  readonly speakerName: string | null;
  readonly mine: boolean;
  /** Secondes depuis le début de l'appel — l'horodatage d'iOS (`formatDuration`). */
  readonly offsetSec: number;
  readonly original: string;
  readonly text: string;
  readonly language: string;
  readonly translated: boolean;
};

export const callTranscriptQueryKey = (callId: string) => ['calls', 'transcript', callId] as const;

export function decodeCallTranscript(raw: unknown): CallTranscript | null {
  const parsed = WireTranscript.safeParse(raw);
  if (!parsed.success) return null;
  const started = parsed.data.callStartedAt == null ? Number.NaN : Date.parse(parsed.data.callStartedAt);
  return {
    callId: parsed.data.callId,
    startedAtMs: Number.isFinite(started) ? started : null,
    segments: parsed.data.segments.flatMap((entry) => {
      const segment = WireSegment.safeParse(entry);
      return segment.success && segment.data.text.trim() !== '' ? [segment.data] : [];
    }),
  };
}

export function transcriptLines(transcript: CallTranscript, reader: { readonly viewerId: string; readonly languages: readonly string[] }): readonly TranscriptLine[] {
  const origin = transcript.startedAtMs ?? transcript.segments[0]?.capturedAtMs ?? 0;
  return [...transcript.segments]
    .sort((left, right) => left.capturedAtMs - right.capturedAtMs)
    .map((segment) => {
      const mine = segment.speakerId === reader.viewerId;
      const translations = Object.fromEntries((segment.translations ?? []).map((entry) => [entry.targetLanguage, entry.translatedText]));
      const shown = mine ? { text: segment.text, language: segment.language, translated: false } : served({ preferredLanguages: reader.languages, originalLanguage: segment.language, translations, original: segment.text });
      return {
        id: segment.id,
        speakerId: segment.speakerId,
        speakerName: segment.speakerDisplayName ?? null,
        mine,
        offsetSec: Math.max(0, Math.floor((segment.capturedAtMs - origin) / 1000)),
        original: segment.text,
        text: shown.text,
        language: shown.language,
        translated: shown.translated,
      };
    });
}

const PAGE = 100;

/** Garde-fou : une passerelle qui dirait « encore » sans fin ne fait pas tourner le client sans fin (100 pages = 10 000 segments). */
const MAX_PAGES = 100;

const HasMore = z.object({ hasMore: z.optional(z.boolean()) });

const moreAfter = (raw: unknown): boolean => HasMore.safeParse(raw).data?.hasMore === true;

type Deps = Pick<CallsDeps, 'source' | 'transport'>;

/** Les pages suivantes, lues l'une après l'autre ; une page refusée (limite de débit, réseau) garde ce qui est déjà lu. */
async function followingPages(deps: Deps, callId: string, read: CallTranscript, pages: number, signal: AbortSignal | undefined): Promise<CallTranscript> {
  if (pages >= MAX_PAGES) return read;
  const offset = pages * PAGE;
  const result = await deps.transport.request<unknown>({ method: 'GET', path: `${callsEndpoints.byCallIdTranscript(callId)}?limit=${PAGE}&offset=${offset}`, ...(signal === undefined ? {} : { signal }) });
  const next = result.ok ? decodeCallTranscript(result.data) : null;
  if (!result.ok || next === null) return read;
  const joined = { ...read, segments: [...read.segments, ...next.segments] };
  return moreAfter(result.data) ? followingPages(deps, callId, joined, pages + 1, signal) : joined;
}

/**
 * Le journal ENTIER de l'appel (#8579) : la passerelle le sert par pages de
 * cent segments (`hasMore`), et un appel d'une heure en compte des centaines.
 */
export async function loadCallTranscript(deps: Deps, callId: string, signal?: AbortSignal): Promise<ApiResult<CallTranscript | null>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureCallTranscript } = await import('@/lib/api/fixtures-calls');
    return { ok: true, data: fixtureCallTranscript(callId) };
  }
  const result = await deps.transport.request<unknown>({ method: 'GET', path: `${callsEndpoints.byCallIdTranscript(callId)}?limit=${PAGE}`, ...(signal === undefined ? {} : { signal }) });
  if (!result.ok) return result.status === 403 || result.status === 404 ? { ok: true, data: null } : result;
  const first = decodeCallTranscript(result.data);
  if (first === null || !moreAfter(result.data)) return { ok: true, data: first };
  return { ok: true, data: await followingPages(deps, callId, first, 1, signal) };
}
