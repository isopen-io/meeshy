/**
 * @jest-environment node
 *
 * #9953 — la puce « Reposté de @auteur » ne survit à une republication
 * directe que si l'original était PUBLIC.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { repostCreditIsDue, repostSnapshotStoryEffects, withoutRepostCredits } from '../repostCreditChips';

const credit = { id: 'credit', text: 'Reposté de @ada', isLocked: true };
const authorText = { id: 'mine', text: 'Bonjour' };

const v1Effects = { textObjects: [authorText, credit], background: '#000000' };

const v3Effects = {
  v: 3,
  scenes: [
    {
      id: 'scene-1',
      objects: [
        { id: 'mine', kind: 'text', payload: { text: 'Bonjour' } },
        { id: 'credit', kind: 'text', payload: { text: 'Reposté de @ada', isLocked: true } },
        { id: 'photo', kind: 'media', payload: { postMediaId: 'm1', isLocked: true } },
      ],
    },
  ],
};

describe('repostCreditIsDue', () => {
  it('autorise la puce sur un original PUBLIC, quelle que soit la casse', () => {
    expect(repostCreditIsDue('PUBLIC')).toBe(true);
    expect(repostCreditIsDue('public')).toBe(true);
  });

  it('la refuse sur toute audience restreinte, et sur une audience inconnue', () => {
    for (const visibility of ['FRIENDS', 'PRIVATE', 'COMMUNITY', 'EXCEPT', 'ONLY', '', null, undefined]) {
      expect(repostCreditIsDue(visibility)).toBe(false);
    }
  });
});

describe('withoutRepostCredits', () => {
  it('retire les textes verrouillés v1 et garde le texte de l’auteur', () => {
    const result = withoutRepostCredits(v1Effects);
    expect(result.changed).toBe(true);
    expect(result.effects).toEqual({ textObjects: [authorText], background: '#000000' });
  });

  it('retire les textes verrouillés v3, jamais un autre objet', () => {
    const result = withoutRepostCredits(v3Effects);
    expect(result.changed).toBe(true);
    expect(result.effects).toEqual({
      v: 3,
      scenes: [
        {
          id: 'scene-1',
          objects: [
            { id: 'mine', kind: 'text', payload: { text: 'Bonjour' } },
            { id: 'photo', kind: 'media', payload: { postMediaId: 'm1', isLocked: true } },
          ],
        },
      ],
    });
  });

  it('rend le blob intact quand il ne porte aucune puce', () => {
    const effects = { textObjects: [authorText] };
    expect(withoutRepostCredits(effects)).toEqual({ effects, changed: false });
    expect(withoutRepostCredits(null)).toEqual({ effects: null, changed: false });
  });
});

describe('repostSnapshotStoryEffects', () => {
  it('garde la puce quand l’original est PUBLIC', () => {
    expect(repostSnapshotStoryEffects(v1Effects, 'PUBLIC')).toBe(v1Effects);
  });

  it('la retire quand l’original ne l’est pas', () => {
    expect(repostSnapshotStoryEffects(v1Effects, 'FRIENDS')).toEqual({ textObjects: [authorText], background: '#000000' });
    expect(repostSnapshotStoryEffects(v3Effects, null)).not.toEqual(v3Effects);
  });

  it('laisse passer une story sans effets', () => {
    expect(repostSnapshotStoryEffects(undefined, 'FRIENDS')).toBeUndefined();
  });

  it('est la seule copie de storyEffects faite par repostPost', () => {
    const source = readFileSync(join(__dirname, '..', '..', 'PostService.ts'), 'utf8');
    expect(source).toContain('snapshotStoryEffects = repostSnapshotStoryEffects(');
    expect(source).not.toContain('snapshotStoryEffects = original.storyEffects as Prisma.InputJsonValue | undefined;');
  });
});
