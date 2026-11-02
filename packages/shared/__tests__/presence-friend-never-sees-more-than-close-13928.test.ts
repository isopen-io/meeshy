import { describe, it, expect } from 'vitest';
import {
  applyPresenceVisibility,
  resolvePresenceVisibility,
  type PresenceVisibilityInput,
} from '../utils/presence-visibility';
import { getUserPresenceStatus } from '../utils/user-presence';
import type { RelationLevel } from '../types/relation';

/**
 * #13928, revue adversariale — un Ami ne voit jamais PLUS qu'un Proche.
 *
 * La loi tait `lastActiveAt` à l'Ami et lui laisse `isOnline` brut. Or la règle
 * 1/3/5 tient `isOnline` pour autoritatif SOUS la garde anti-stale de 5 min,
 * qui se calcule sur `lastActiveAt`. Pour une ligne `isOnline: true` dont la
 * dernière activité date de plus de 5 min (heartbeat perdu, écriture ratée,
 * balayage de maintenance à 30 min), le Proche voit « rien » et l'Ami voit
 * « en ligne » — l'Ami en sait plus, et le faux. Le témoin interroge ce que les
 * clients RENDENT de la charge servie (`getUserPresenceStatus`), jamais la carte.
 */

const NOW = Date.parse('2026-10-31T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms);

const inputFor = (relationLevel: RelationLevel): PresenceVisibilityInput => ({
  isSelf: false,
  viewerRole: 'USER',
  relationLevel,
  targetShowOnlineStatus: true,
  targetShowLastSeen: true,
  targetIsDeactivated: false,
  isBlockedEitherWay: false,
});

const rendered = (relationLevel: RelationLevel, row: { isOnline: boolean; lastActiveAt: Date | null }) =>
  getUserPresenceStatus(applyPresenceVisibility(row, resolvePresenceVisibility(inputFor(relationLevel)), NOW), NOW);

const ROWS = [true, false].flatMap((isOnline) =>
  [10_000, 120_000, 240_000, 20 * 60_000, null].map((elapsed) => ({
    isOnline,
    lastActiveAt: elapsed === null ? null : ago(elapsed),
  })),
);

describe('#13928 — l\'Ami est binaire ET ne voit jamais plus que le Proche', () => {
  it.each(ROWS)('ligne %o : l\'Ami ne rend que « en ligne » ou rien', (row) => {
    expect(['online', 'offline']).toContain(rendered('FRIEND', row));
  });

  it.each(ROWS)('ligne %o : « en ligne » chez l\'Ami implique « en ligne » chez le Proche', (row) => {
    const ami = rendered('FRIEND', row);
    const proche = rendered('CLOSE', row);
    expect(ami === 'online' ? proche : 'online').toBe('online');
  });
});
