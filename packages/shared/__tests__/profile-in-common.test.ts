import { describe, it, expect } from 'vitest';
import {
  IN_COMMON_PARTS,
  IN_COMMON_PART_CIRCLE,
  resolveInCommonParts,
  type InCommonPart,
} from '../utils/profile-in-common';
import type { ProfileCircleViewInput } from '../utils/profile-circle-view';
import { RELATION_LEVELS, compareRelationLevel, type RelationLevel } from '../types/relation';

const inputAt = (granted: RelationLevel, overrides: Partial<ProfileCircleViewInput> = {}): ProfileCircleViewInput => ({
  viewerId: 'viewer',
  targetId: 'target',
  grantedByViewer: granted,
  grantedByTarget: granted,
  sharesCommunity: false,
  viewerMinor: 'unknown',
  targetMinor: 'unknown',
  viewerRole: 'USER',
  targetRole: 'USER',
  ...overrides,
});

const PLANCHE: Readonly<Record<InCommonPart, RelationLevel>> = {
  communities: 'COMMUNITY',
  friends: 'FRIEND',
  media: 'ACQUAINTANCE',
};

describe('resolveInCommonParts — « En commun », chaque partie gardée par son cercle (#19200)', () => {
  it('annonce le cercle de la planche pour chaque partie', () => {
    expect(IN_COMMON_PARTS).toEqual(['communities', 'friends', 'media']);
    expect(IN_COMMON_PART_CIRCLE).toEqual(PLANCHE);
  });

  it.each(IN_COMMON_PARTS)('%s : ouverte au cercle et au-dessus, fermée un rang dessous', (part) => {
    for (const level of RELATION_LEVELS) {
      if (level === 'PUBLIC' || level === 'COMMUNITY') continue;
      const expected = compareRelationLevel(level, PLANCHE[part]) >= 0 ? 'open' : 'locked';
      expect(resolveInCommonParts(inputAt(level))[part]).toEqual({ state: expected, circle: PLANCHE[part] });
    }
  });

  it('une communauté partagée ouvre les communautés, et rien de plus', () => {
    const parts = resolveInCommonParts(inputAt('PUBLIC', { sharesCommunity: true }));
    expect(parts.communities.state).toBe('open');
    expect(parts.media.state).toBe('locked');
    expect(parts.friends.state).toBe('locked');
  });

  it('sans communauté ni lien : tout est fermé', () => {
    const parts = resolveInCommonParts(inputAt('PUBLIC'));
    expect(IN_COMMON_PARTS.map((part) => parts[part].state)).toEqual(['locked', 'locked', 'locked']);
  });

  it('le cercle se juge sur le PLUS BAS des deux accords', () => {
    const parts = resolveInCommonParts(inputAt('BLOOD', { grantedByTarget: 'ACQUAINTANCE' }));
    expect(parts.media.state).toBe('open');
    expect(parts.friends.state).toBe('locked');
  });

  it.each([
    ['bloquée', { blockedEitherWay: true }],
    ['désactivée', { targetDeactivated: true }],
    ['soi-même', { targetId: 'viewer' }],
    ['identité absente', { viewerId: '' }],
  ] as const)('cible %s : la même réponse qu’un inconnu (loi 9)', (_label, overrides) => {
    const closed = resolveInCommonParts(inputAt('PUBLIC'));
    expect(resolveInCommonParts(inputAt('BLOOD', { sharesCommunity: true, ...overrides }))).toEqual(closed);
  });

  it('une partie fermée ne porte que son état et son cercle', () => {
    const parts = resolveInCommonParts(inputAt('PUBLIC'));
    for (const part of IN_COMMON_PARTS) expect(Object.keys(parts[part]).sort()).toEqual(['circle', 'state']);
  });

  it('deux comptes de l’équipe ont entre eux les outils de cercle (#16623)', () => {
    const parts = resolveInCommonParts(inputAt('PUBLIC', { viewerRole: 'MODERATOR', targetRole: 'ADMIN' }));
    expect(IN_COMMON_PARTS.map((part) => parts[part].state)).toEqual(['open', 'open', 'open']);
  });

  it('un ADMIN face à un utilisateur ordinaire n’a que son lien', () => {
    const parts = resolveInCommonParts(inputAt('PUBLIC', { viewerRole: 'BIGBOSS' }));
    expect(IN_COMMON_PARTS.map((part) => parts[part].state)).toEqual(['locked', 'locked', 'locked']);
  });
});
