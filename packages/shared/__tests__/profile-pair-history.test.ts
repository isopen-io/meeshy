import { describe, it, expect } from 'vitest';
import {
  PAIR_HISTORY_MESSAGE_MILESTONES,
  pairHistoryLevelEntries,
  resolvePairHistory,
  pairHistoryWire,
} from '../utils/profile-pair-history';
import type { RelationLevel, RelationTransition } from '../types/relation';

const V = 'viewer';
const T = 'target';
const day = (d: string): Date => new Date(`2026-${d}T10:00:00.000Z`);
const step = (actorId: string, from: RelationLevel, to: RelationLevel, at: string): RelationTransition => ({ actorId, from, to, at: day(at) });

const ACTORS = [V, T] as const;

const RISE_TO_CLOSE: RelationTransition[] = [
  step(T, 'PUBLIC', 'ACQUAINTANCE', '03-06'),
  step(V, 'PUBLIC', 'ACQUAINTANCE', '03-07'),
  step(V, 'ACQUAINTANCE', 'FRIEND', '03-10'),
  step(T, 'ACQUAINTANCE', 'FRIEND', '03-11'),
  step(T, 'FRIEND', 'CLOSE', '03-15'),
  step(V, 'FRIEND', 'CLOSE', '03-19'),
];

describe('pairHistoryLevelEntries — l’entrée de la paire à chaque niveau EFFECTIF (#19378)', () => {
  it('date chaque niveau par le plus tardif des deux accords', () => {
    expect(pairHistoryLevelEntries({ transitions: RISE_TO_CLOSE, effectiveLevel: 'CLOSE', actorIds: ACTORS })).toEqual([
      { level: 'ACQUAINTANCE', at: day('03-07') },
      { level: 'FRIEND', at: day('03-11') },
      { level: 'CLOSE', at: day('03-19') },
    ]);
  });

  it('ne sert jamais un niveau au-dessus du cercle commun : un accord unilatéral reste muet', () => {
    const unilateral = [...RISE_TO_CLOSE, step(T, 'CLOSE', 'BLOOD', '04-01')];
    const levels = pairHistoryLevelEntries({ transitions: unilateral, effectiveLevel: 'CLOSE', actorIds: ACTORS }).map((e) => e.level);
    expect(levels).toEqual(['ACQUAINTANCE', 'FRIEND', 'CLOSE']);
  });

  it('un niveau que seul UN des deux a daté ne se sert pas (sa date serait celle d’un geste unilatéral)', () => {
    const oneSided = [step(T, 'PUBLIC', 'FRIEND', '03-02')];
    expect(pairHistoryLevelEntries({ transitions: oneSided, effectiveLevel: 'FRIEND', actorIds: ACTORS })).toEqual([]);
  });

  it('une baisse puis une remontée ne se voient pas : la première entrée reste, rien ne date la baisse', () => {
    const withDrop = [...RISE_TO_CLOSE, step(V, 'CLOSE', 'FRIEND', '04-02'), step(V, 'FRIEND', 'CLOSE', '05-20')];
    const entries = pairHistoryLevelEntries({ transitions: withDrop, effectiveLevel: 'CLOSE', actorIds: ACTORS });
    expect(entries.find((e) => e.level === 'CLOSE')?.at).toEqual(day('03-19'));
    expect(entries.map((e) => e.at.toISOString())).not.toContain(day('04-02').toISOString());
    expect(entries.map((e) => e.at.toISOString())).not.toContain(day('05-20').toISOString());
  });

  it('un niveau perdu n’est plus servi', () => {
    const levels = pairHistoryLevelEntries({ transitions: RISE_TO_CLOSE, effectiveLevel: 'FRIEND', actorIds: ACTORS }).map((e) => e.level);
    expect(levels).toEqual(['ACQUAINTANCE', 'FRIEND']);
  });

  it('les passages d’un tiers ne comptent pas', () => {
    const foreign = [step('other', 'PUBLIC', 'FRIEND', '01-01'), step(V, 'PUBLIC', 'FRIEND', '03-10')];
    expect(pairHistoryLevelEntries({ transitions: foreign, effectiveLevel: 'FRIEND', actorIds: ACTORS })).toEqual([]);
  });

  it('sous la Connaissance, aucun niveau ne se raconte', () => {
    expect(pairHistoryLevelEntries({ transitions: RISE_TO_CLOSE, effectiveLevel: 'COMMUNITY', actorIds: ACTORS })).toEqual([]);
  });
});

describe('resolvePairHistory — la frise « Notre histoire », dans l’ordre du temps', () => {
  it('compose premier message, niveaux et jalons, triés par date', () => {
    const items = resolvePairHistory({
      transitions: RISE_TO_CLOSE,
      effectiveLevel: 'FRIEND',
      actorIds: ACTORS,
      firstMessageAt: day('03-06'),
      milestones: [{ count: 1000, at: day('05-06') }],
    });
    expect(items).toEqual([
      { kind: 'first-message', at: day('03-06') },
      { kind: 'level', level: 'ACQUAINTANCE', at: day('03-07') },
      { kind: 'level', level: 'FRIEND', at: day('03-11') },
      { kind: 'messages-milestone', count: 1000, at: day('05-06') },
    ]);
  });

  it('sans message ni passage : une frise vide', () => {
    expect(resolvePairHistory({ transitions: [], effectiveLevel: 'ACQUAINTANCE', actorIds: ACTORS, firstMessageAt: null, milestones: [] })).toEqual([]);
  });

  it('les jalons sont ceux de la planche', () => {
    expect(PAIR_HISTORY_MESSAGE_MILESTONES).toEqual([1000, 10000]);
  });
});

describe('pairHistoryWire — la projection que lit le client iOS (data.history)', () => {
  it('nomme chaque étape d’un seul mot', () => {
    const wire = pairHistoryWire([
      { kind: 'first-message', at: day('03-06') },
      { kind: 'level', level: 'ACQUAINTANCE', at: day('03-07') },
      { kind: 'level', level: 'FRIEND', at: day('03-11') },
      { kind: 'level', level: 'CLOSE', at: day('03-19') },
      { kind: 'level', level: 'BLOOD', at: day('03-20') },
      { kind: 'messages-milestone', count: 1000, at: day('05-06') },
      { kind: 'messages-milestone', count: 10000, at: day('09-06') },
    ]);
    expect(wire.map((w) => w.kind)).toEqual(['firstMessage', 'acquaintance', 'friend', 'close', 'blood', 'messages1000', 'messages10000']);
    expect(wire[0]).toEqual({ kind: 'firstMessage', at: day('03-06').toISOString() });
  });
});
