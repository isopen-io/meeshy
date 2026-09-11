import { dayLabel, sameLocalDay, type DayLabels } from '@/lib/grouping';

import type { ConversationEpisode, EpisodeInputMessage } from './types';

/**
 * SEGMENTATION EN ÉPISODES — miroir de `EpisodeSegmenter.swift` (#5695,
 * étape 4). Coupure sur : trou temporel > `EPISODE_GAP_MS` (6 h), OU
 * changement complet de l'ensemble des locuteurs, OU franchissement de
 * jour. Fusion des épisodes < `MIN_EPISODE_MESSAGES` (4) dans le voisin le
 * plus proche. Plafond `MAX_EPISODES` (8) par fusion des plus petits.
 *
 * 100 % pur, 100 % testable : aucune donnée n'est inventée, chaque épisode
 * reste une partition EXACTE de `messages` (mêmes ids, aucun doublon, aucun
 * trou).
 */

export const EPISODE_GAP_MS = 6 * 3600 * 1000;
export const MIN_EPISODE_MESSAGES = 4;
export const MAX_EPISODES = 8;

export type SegmentEpisodesOptions = {
  readonly locale: string;
  readonly timeZone?: string;
  readonly labels?: DayLabels;
};

export function segmentEpisodes(
  messages: readonly EpisodeInputMessage[],
  options: SegmentEpisodesOptions,
): readonly ConversationEpisode[] {
  if (messages.length === 0) return [];

  const sorted = [...messages].sort((a, b) => a.createdAt - b.createdAt);
  const rawGroups = splitIntoRawGroups(sorted, options.timeZone);
  const merged = mergeSmallGroups(rawGroups, MIN_EPISODE_MESSAGES);
  const capped = capGroups(merged, MAX_EPISODES);

  return capped.map((group) => makeEpisode(group, options));
}

// MARK: - Découpage brut

function splitIntoRawGroups(
  sorted: readonly EpisodeInputMessage[],
  timeZone: string | undefined,
): readonly (readonly EpisodeInputMessage[])[] {
  const groups: EpisodeInputMessage[][] = [];
  let current: EpisodeInputMessage[] = [sorted[0] as EpisodeInputMessage];

  for (let i = 1; i < sorted.length; i += 1) {
    const message = sorted[i] as EpisodeInputMessage;
    const previous = current[current.length - 1] as EpisodeInputMessage;
    const gap = message.createdAt - previous.createdAt;
    const crossedDay = !sameLocalDay(new Date(message.createdAt), new Date(previous.createdAt), timeZone);

    const recentSpeakers = new Set(current.slice(-MIN_EPISODE_MESSAGES).map((m) => m.senderId));
    const completeSpeakerChange = current.length >= MIN_EPISODE_MESSAGES && !recentSpeakers.has(message.senderId);

    if (gap > EPISODE_GAP_MS || crossedDay || completeSpeakerChange) {
      groups.push(current);
      current = [message];
    } else {
      current = [...current, message];
    }
  }
  groups.push(current);
  return groups;
}

// MARK: - Fusion des petits épisodes dans le voisin le plus proche

function mergeSmallGroups(
  groups: readonly (readonly EpisodeInputMessage[])[],
  minSize: number,
): readonly (readonly EpisodeInputMessage[])[] {
  if (groups.length <= 1) return groups;
  let result = groups.map((g) => [...g]);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (result.length <= 1) break;
    const idx = result.findIndex((g) => g.length < minSize);
    if (idx === -1) break;

    let mergeIntoNext: boolean;
    if (idx === 0) {
      mergeIntoNext = true;
    } else if (idx === result.length - 1) {
      mergeIntoNext = false;
    } else {
      const prevGroup = result[idx - 1] as EpisodeInputMessage[];
      const group = result[idx] as EpisodeInputMessage[];
      const nextGroup = result[idx + 1] as EpisodeInputMessage[];
      const gapToPrev = (group[0] as EpisodeInputMessage).createdAt - (prevGroup[prevGroup.length - 1] as EpisodeInputMessage).createdAt;
      const gapToNext = (nextGroup[0] as EpisodeInputMessage).createdAt - (group[group.length - 1] as EpisodeInputMessage).createdAt;
      mergeIntoNext = gapToNext <= gapToPrev;
    }

    const next: EpisodeInputMessage[][] = [];
    for (let i = 0; i < result.length; i += 1) {
      if (mergeIntoNext && i === idx + 1) {
        next.push([...(result[idx] as EpisodeInputMessage[]), ...(result[idx + 1] as EpisodeInputMessage[])]);
      } else if (!mergeIntoNext && i === idx - 1) {
        next.push([...(result[idx - 1] as EpisodeInputMessage[]), ...(result[idx] as EpisodeInputMessage[])]);
      } else if (i === idx) {
        // Absorbé dans le voisin — rien à pousser ici.
      } else {
        next.push(result[i] as EpisodeInputMessage[]);
      }
    }
    result = next;
  }
  return result;
}

// MARK: - Plafond, par fusion des plus petits voisins adjacents

function capGroups(
  groups: readonly (readonly EpisodeInputMessage[])[],
  maxCount: number,
): readonly (readonly EpisodeInputMessage[])[] {
  let result = groups.map((g) => [...g]);
  while (result.length > maxCount) {
    let bestIdx = 0;
    let bestSize = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < result.length - 1; i += 1) {
      const combined = (result[i] as EpisodeInputMessage[]).length + (result[i + 1] as EpisodeInputMessage[]).length;
      if (combined < bestSize) {
        bestSize = combined;
        bestIdx = i;
      }
    }
    const next: EpisodeInputMessage[][] = [];
    for (let i = 0; i < result.length; i += 1) {
      if (i === bestIdx) {
        next.push([...(result[bestIdx] as EpisodeInputMessage[]), ...(result[bestIdx + 1] as EpisodeInputMessage[])]);
      } else if (i === bestIdx + 1) {
        // Absorbé.
      } else {
        next.push(result[i] as EpisodeInputMessage[]);
      }
    }
    result = next;
  }
  return result;
}

// MARK: - Titre déterministe

function messagesSuffix(count: number): string {
  return count === 1 ? '1 message' : `${count} messages`;
}

function makeEpisode(group: readonly EpisodeInputMessage[], options: SegmentEpisodesOptions): ConversationEpisode {
  const start = (group[0] as EpisodeInputMessage).createdAt;
  const end = (group[group.length - 1] as EpisodeInputMessage).createdAt;

  const labelOptions = {
    now: end,
    locale: options.locale,
    ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
    ...(options.labels === undefined ? {} : { labels: options.labels }),
  };
  const startLabel = dayLabel(new Date(start), labelOptions);
  const dayPart = sameLocalDay(new Date(start), new Date(end), options.timeZone)
    ? startLabel
    : `${startLabel}–${dayLabel(new Date(end), labelOptions)}`;

  const title = `${dayPart} · ${messagesSuffix(group.length)}`;

  return {
    id: `${(group[0] as EpisodeInputMessage).id}_${(group[group.length - 1] as EpisodeInputMessage).id}`,
    start,
    end,
    messageIds: group.map((m) => m.id),
    participantIds: [...new Set(group.map((m) => m.senderId))].sort(),
    deterministicTitle: title,
    agentTitle: null,
  };
}
