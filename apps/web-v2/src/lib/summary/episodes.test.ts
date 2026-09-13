import { describe, expect, test } from 'bun:test';

import { MAX_EPISODES, MIN_EPISODE_MESSAGES, segmentEpisodes } from './episodes';
import { displayTitle, isAgentTitled, type EpisodeInputMessage } from './types';

/**
 * `segmentEpisodes` — miroir de `EpisodeSegmenterTests.swift` (#5695,
 * étape 4). Base `1_700_000_000_000` ms, calendrier UTC — les 11 cas iOS,
 * plus les 2 cas web du RANG de cadrage (leçon 261).
 */

/**
 * Base posée à 09:00 UTC (loin de tout minuit local) — un calendrier
 * `2026-01-10`, comme la spécification #5695 le prescrit (« calendrier UTC
 * 2026-01-<jour> »), plutôt que l'epoch brute `1_700_000_000`, qui tombe à
 * 22:13 UTC (moins de deux heures d'un minuit) et ferait basculer de jour
 * les cas censés rester groupés.
 */
const BASE = Date.UTC(2026, 0, 10, 9, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const msg = (
  id: string,
  senderId: string,
  createdAt: number,
  extra: Partial<Pick<EpisodeInputMessage, 'replyToId' | 'isSystem'>> = {},
): EpisodeInputMessage => ({
  id,
  senderId,
  createdAt,
  replyToId: extra.replyToId ?? null,
  isSystem: extra.isSystem ?? false,
});

const opts = { locale: 'fr', timeZone: 'UTC' };

describe('segmentEpisodes — les onze cas iOS', () => {
  test('emptyInput_producesNoEpisodes', () => {
    expect(segmentEpisodes([], opts)).toEqual([]);
  });

  test('singleMessage_producesOneEpisodeContainingIt', () => {
    const episodes = segmentEpisodes([msg('m1', 'u1', BASE)], opts);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.messageIds).toEqual(['m1']);
  });

  test('hundredMessagesOverFiveDays_producesAtMostEightNonEmptyEpisodes_exactPartition', () => {
    const messages: EpisodeInputMessage[] = [];
    for (let day = 0; day < 5; day += 1) {
      for (let i = 0; i < 20; i += 1) {
        const sender = i % 2 === 0 ? 'u1' : 'u2';
        messages.push(msg(`d${day}-${i}`, sender, BASE + day * DAY + i * 10 * 60_000));
      }
    }
    const episodes = segmentEpisodes(messages, opts);
    expect(episodes.length).toBeLessThanOrEqual(8);
    expect(episodes.every((e) => e.messageIds.length > 0)).toBe(true);
    const allIds = episodes.flatMap((e) => e.messageIds);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(new Set(allIds)).toEqual(new Set(messages.map((m) => m.id)));
  });

  test('gapOverSixHours_cutsANewEpisode', () => {
    const messages = [
      msg('m1', 'u1', BASE),
      msg('m2', 'u2', BASE + 10 * 60_000),
      msg('m3', 'u1', BASE + 20 * 60_000),
      msg('m4', 'u2', BASE + 30 * 60_000),
      msg('m5', 'u1', BASE + 30 * 60_000 + 7 * HOUR),
      msg('m6', 'u2', BASE + 30 * 60_000 + 7 * HOUR + 10 * 60_000),
      msg('m7', 'u1', BASE + 30 * 60_000 + 7 * HOUR + 20 * 60_000),
      msg('m8', 'u2', BASE + 30 * 60_000 + 7 * HOUR + 30 * 60_000),
    ];
    const episodes = segmentEpisodes(messages, opts);
    expect(episodes.map((e) => e.messageIds)).toEqual([
      ['m1', 'm2', 'm3', 'm4'],
      ['m5', 'm6', 'm7', 'm8'],
    ]);
  });

  test('gapUnderSixHours_staysInSameEpisode', () => {
    const episodes = segmentEpisodes(
      [msg('m1', 'u1', BASE), msg('m2', 'u2', BASE + 3 * HOUR)],
      opts,
    );
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.messageIds).toEqual(['m1', 'm2']);
  });

  test('dayBoundaryCrossing_cutsANewEpisode', () => {
    // 2026-01-10 23:50 UTC → 2026-01-11 00:10 UTC : 20 minutes, minuit franchi.
    const before = Date.UTC(2026, 0, 10, 23, 50);
    const messages = [
      msg('m1', 'u1', before - 30 * 60_000),
      msg('m2', 'u2', before - 20 * 60_000),
      msg('m3', 'u1', before - 10 * 60_000),
      msg('m4', 'u2', before),
      msg('m5', 'u1', before + 10 * 60_000),
      msg('m6', 'u2', before + 15 * 60_000),
      msg('m7', 'u1', before + 20 * 60_000),
      msg('m8', 'u2', before + 25 * 60_000),
    ];
    const episodes = segmentEpisodes(messages, opts);
    expect(episodes.map((e) => e.messageIds)).toEqual([
      ['m1', 'm2', 'm3', 'm4'],
      ['m5', 'm6', 'm7', 'm8'],
    ]);
  });

  test('tinyEpisode_isMergedIntoNearestNeighbor_neverLeftAlone', () => {
    // Deux groupes de 3 (< MIN_EPISODE_MESSAGES) séparés par > 6 h — fusionnés en UN épisode de 6.
    const messages = [
      msg('m1', 'u1', BASE),
      msg('m2', 'u2', BASE + 5 * 60_000),
      msg('m3', 'u1', BASE + 10 * 60_000),
      msg('m4', 'u2', BASE + 10 * 60_000 + 7 * HOUR),
      msg('m5', 'u1', BASE + 15 * 60_000 + 7 * HOUR),
      msg('m6', 'u2', BASE + 20 * 60_000 + 7 * HOUR),
    ];
    const episodes = segmentEpisodes(messages, opts);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.messageIds).toHaveLength(6);
    expect(episodes.every((e) => e.messageIds.length >= MIN_EPISODE_MESSAGES)).toBe(true);
  });

  test('manyGaps_stillCapsAtMaxEpisodes', () => {
    const messages: EpisodeInputMessage[] = [];
    for (let g = 0; g < 20; g += 1) {
      for (let i = 0; i < 4; i += 1) {
        const sender = i % 2 === 0 ? 'u1' : 'u2';
        messages.push(msg(`g${g}-${i}`, sender, BASE + g * 7 * HOUR + i * 5 * 60_000));
      }
    }
    const episodes = segmentEpisodes(messages, opts);
    expect(episodes.length).toBeLessThanOrEqual(MAX_EPISODES);
    const allIds = episodes.flatMap((e) => e.messageIds);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(new Set(allIds)).toEqual(new Set(messages.map((m) => m.id)));
    expect(episodes.every((e) => e.messageIds.length > 0)).toBe(true);
  });

  test('deterministicTitle_isAlwaysPresent_andAgentTitleIsNull', () => {
    const episodes = segmentEpisodes(
      [msg('m1', 'u1', BASE), msg('m2', 'u2', BASE + 60_000)],
      opts,
    );
    const episode = episodes[0];
    expect(episode?.deterministicTitle.length).toBeGreaterThan(0);
    expect(episode?.deterministicTitle).toContain('·');
    expect(episode?.agentTitle).toBeNull();
    expect(episode ? isAgentTitled(episode) : true).toBe(false);
    expect(episode ? displayTitle(episode) : '').toBe(episode?.deterministicTitle);
  });

  test('deterministicTitle_stableAcrossRepeatedComputation', () => {
    const messages = [msg('m1', 'u1', BASE), msg('m2', 'u2', BASE + 60_000)];
    const first = segmentEpisodes(messages, opts)[0]?.deterministicTitle;
    const second = segmentEpisodes(messages, opts)[0]?.deterministicTitle;
    expect(first).toBe(second);
  });

  test('participantIds_areDeduplicatedAndSorted', () => {
    const episodes = segmentEpisodes(
      [
        msg('m1', 'u3', BASE),
        msg('m2', 'u1', BASE + 60_000),
        msg('m3', 'u3', BASE + 120_000),
        msg('m4', 'u2', BASE + 180_000),
      ],
      opts,
    );
    expect(episodes[0]?.participantIds).toEqual(['u1', 'u2', 'u3']);
  });
});

describe('segmentEpisodes — les deux cas web (rang du cadrage, leçon 261)', () => {
  test('title_isFramedByInjectedLocale_notByDocumentLocale', () => {
    // `start` J-4 par rapport à `end` (l'épisode se referme aujourd'hui) —
    // les DEUX messages, trop peu nombreux (< MIN_EPISODE_MESSAGES), sont
    // fusionnés en UN seul épisode dont le `start` reste à 4 jours de `end`
    // (`now`) : assez loin pour un nom de jour localisé, pas une date complète.
    const end = Date.UTC(2026, 0, 15, 9, 0);
    const start = end - 4 * DAY;
    const messages = [msg('m1', 'u1', start), msg('m2', 'u2', end)];
    const fr = segmentEpisodes(messages, { locale: 'fr', timeZone: 'UTC' })[0]?.deterministicTitle;
    const en = segmentEpisodes(messages, { locale: 'en', timeZone: 'UTC' })[0]?.deterministicTitle;
    const expectedFrWeekday = new Intl.DateTimeFormat('fr', { weekday: 'long', timeZone: 'UTC' })
      .format(new Date(start));
    const expectedEnWeekday = new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' })
      .format(new Date(start));
    expect(fr?.toLowerCase().startsWith(expectedFrWeekday.toLowerCase())).toBe(true);
    expect(en?.toLowerCase().startsWith(expectedEnWeekday.toLowerCase())).toBe(true);
    expect(fr).not.toBe(en);
  });

  test('title_usesEpisodeEndAsNow_neverWallClock', () => {
    const messages = [msg('m1', 'u1', BASE), msg('m2', 'u2', BASE + 60_000)];
    const withOptionsA = segmentEpisodes(messages, opts)[0]?.deterministicTitle;
    const withOptionsB = segmentEpisodes(messages, { ...opts })[0]?.deterministicTitle;
    // Deux appels, potentiellement à des instants "muraux" différents (le
    // test tourne deux fois), rendent le MÊME titre : `now` est `end`.
    expect(withOptionsA).toBe(withOptionsB);
  });
});
