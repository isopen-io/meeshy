import type { ConnectionQualityLevel } from '@meeshy/shared/types/video-call';

import type { DataProfile } from './call-data-profile';
import type { MediaPath } from './call-quality';
import type { QualityTick } from './call-quality-loop';
import type { ActiveCall, CallEndReason, CallMember } from './call-store';
import type { SurvivalStage } from './call-survival';

/**
 * **LE JOURNAL RÉSEAU ET QUALITÉ D'UN APPEL** (#8698) — ce qui s'est passé
 * sur le réseau pendant l'appel, réduit en événements datés : les phases
 * (connexion, reconnexion, fin et sa raison — une permission refusée, un
 * média absent, un lien perdu), l'état du lien de chaque pair, la qualité
 * (échantillonnée : à chaque changement de niveau, sinon une fois toutes les
 * {@link QUALITY_SAMPLE_MS}), la survie de ma vidéo, le profil de données et
 * le passage par un relais. Tout est pur : l'enregistreur
 * (`call-network-journal-recorder.ts`) compare deux états et range ce qui a
 * changé ; la fiche d'appel en lit le résumé et la chronologie.
 */

export type JournalPhase = 'connecting' | 'connected' | 'reconnecting' | 'ended';

export type JournalEvent =
  | { readonly at: number; readonly kind: 'phase'; readonly phase: Exclude<JournalPhase, 'ended'> }
  | { readonly at: number; readonly kind: 'phase'; readonly phase: 'ended'; readonly reason: CallEndReason; readonly detail: string | null }
  | { readonly at: number; readonly kind: 'link'; readonly name: string; readonly state: CallMember['link'] }
  | {
      readonly at: number;
      readonly kind: 'quality';
      readonly level: ConnectionQualityLevel;
      readonly loss: number;
      readonly rtt: number;
      readonly jitter: number;
      readonly audioKbps: number;
      readonly videoKbps: number;
    }
  | { readonly at: number; readonly kind: 'survival'; readonly stage: SurvivalStage }
  | { readonly at: number; readonly kind: 'profile'; readonly profile: DataProfile; readonly audioBitrate: number }
  | { readonly at: number; readonly kind: 'path'; readonly path: MediaPath };

export const QUALITY_SAMPLE_MS = 30_000;
export const MAX_JOURNAL_EVENTS = 150;

const JOURNALED: ReadonlySet<string> = new Set(['connecting', 'connected', 'reconnecting', 'ended']);

function phaseEvent(call: ActiveCall, at: number): JournalEvent | null {
  const phase = call.phase;
  if (phase.kind === 'ended') return { at, kind: 'phase', phase: 'ended', reason: phase.reason, detail: phase.detail };
  if (phase.kind === 'connecting' || phase.kind === 'connected' || phase.kind === 'reconnecting') return { at, kind: 'phase', phase: phase.kind };
  return null;
}

export function callEvents(previous: ActiveCall | null, next: ActiveCall, at: number): readonly JournalEvent[] {
  const phaseChanged = previous === null || previous.phase.kind !== next.phase.kind;
  const phase = phaseChanged && JOURNALED.has(next.phase.kind) ? phaseEvent(next, at) : null;
  const links = Object.values(next.members).flatMap((member): JournalEvent[] =>
    previous?.members[member.userId]?.link === member.link || member.link === 'waiting' || member.link === 'ringing' ? [] : [{ at, kind: 'link', name: member.name, state: member.link }],
  );
  return [...(phase === null ? [] : [phase]), ...links];
}

export type TickMemory = {
  readonly level: ConnectionQualityLevel;
  readonly sampledAt: number;
  readonly stage: SurvivalStage;
  readonly profile: DataProfile;
  readonly audioBitrate: number;
  readonly path: MediaPath | null;
};

const round = (value: number, digits = 0): number => Math.round(value * 10 ** digits) / 10 ** digits;

export function tickEvents(memory: TickMemory | null, tick: QualityTick, at: number): readonly [readonly JournalEvent[], TickMemory] {
  const { total } = tick;
  const sample = memory === null || memory.level !== total.level || at - memory.sampledAt >= QUALITY_SAMPLE_MS;
  const quality: readonly JournalEvent[] = sample
    ? [{ at, kind: 'quality', level: total.level, loss: round(total.packetLoss, 1), rtt: round(total.rtt), jitter: round(total.jitter), audioKbps: round(total.audioKbps), videoKbps: round(total.videoKbps) }]
    : [];
  const survival: readonly JournalEvent[] = memory !== null && memory.stage !== tick.stage ? [{ at, kind: 'survival', stage: tick.stage }] : [];
  const profile: readonly JournalEvent[] =
    memory === null || memory.profile !== tick.profile || memory.audioBitrate !== tick.audioBitrate ? [{ at, kind: 'profile', profile: tick.profile, audioBitrate: tick.audioBitrate }] : [];
  const path: readonly JournalEvent[] = tick.path !== null && memory?.path !== tick.path ? [{ at, kind: 'path', path: tick.path }] : [];
  const next: TickMemory = {
    level: total.level,
    sampledAt: sample ? at : (memory?.sampledAt ?? at),
    stage: tick.stage,
    profile: tick.profile,
    audioBitrate: tick.audioBitrate,
    path: tick.path ?? memory?.path ?? null,
  };
  return [[...quality, ...survival, ...profile, ...path], next];
}

/** Borné à {@link MAX_JOURNAL_EVENTS} : le premier événement (le début de l'appel) reste, les plus anciens des suivants partent. */
export function boundedJournal(events: readonly JournalEvent[]): readonly JournalEvent[] {
  if (events.length <= MAX_JOURNAL_EVENTS) return events;
  const [first, ...rest] = events;
  return first === undefined ? [] : [first, ...rest.slice(rest.length - (MAX_JOURNAL_EVENTS - 1))];
}

export type JournalSummary = {
  readonly worstLevel: ConnectionQualityLevel | null;
  readonly maxLoss: number;
  readonly maxRtt: number;
  readonly maxJitter: number;
  readonly reconnections: number;
  readonly relayed: boolean;
  readonly profiles: readonly DataProfile[];
  readonly endReason: CallEndReason | null;
};

const RANK: Readonly<Record<ConnectionQualityLevel, number>> = { excellent: 0, good: 1, fair: 2, poor: 3 };

export function journalSummary(events: readonly JournalEvent[]): JournalSummary {
  const qualities = events.flatMap((event) => (event.kind === 'quality' ? [event] : []));
  const worst = (field: 'loss' | 'rtt' | 'jitter'): number => qualities.reduce((max, event) => Math.max(max, event[field]), 0);
  const ended = events.flatMap((event) => (event.kind === 'phase' && event.phase === 'ended' ? [event.reason] : []));
  return {
    worstLevel: qualities.reduce<ConnectionQualityLevel | null>((level, event) => (level === null || RANK[event.level] > RANK[level] ? event.level : level), null),
    maxLoss: worst('loss'),
    maxRtt: worst('rtt'),
    maxJitter: worst('jitter'),
    reconnections: events.filter((event) => event.kind === 'phase' && event.phase === 'reconnecting').length,
    relayed: events.some((event) => event.kind === 'path' && event.path === 'relay'),
    profiles: [...new Set(events.flatMap((event) => (event.kind === 'profile' ? [event.profile] : [])))],
    endReason: ended.at(-1) ?? null,
  };
}
