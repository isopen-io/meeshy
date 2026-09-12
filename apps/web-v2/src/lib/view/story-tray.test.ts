import { describe, expect, test } from 'bun:test';
import { groupStoriesByAuthor, storyAuthorLabel } from './story-tray';
import type { StoryTrayPost } from '@/lib/api/stories';

const story = (id: string, authorId: string, createdAt: string, nom?: string): StoryTrayPost => ({
  id,
  type: 'STORY',
  createdAt,
  author: { id: authorId, username: nom ?? authorId },
});

describe('groupStoriesByAuthor', () => {
  test('un auteur qui publie trois fois ne peint QU\'UN cercle', () => {
    const groupes = groupStoriesByAuthor(
      [
        story('s1', 'a', '2026-09-11T10:00:00Z'),
        story('s2', 'a', '2026-09-11T11:00:00Z'),
        story('s3', 'a', '2026-09-11T09:00:00Z'),
      ],
      { viewerId: 'moi', viewedIds: new Set() },
    );
    expect(groupes).toHaveLength(1);
    expect(groupes[0]?.stories.map((s) => s.id)).toEqual(['s2', 's1', 's3']);
    expect(groupes[0]?.latestAt).toBe(new Date('2026-09-11T11:00:00Z').getTime());
  });

  test('MOI d\'abord, puis le NON VU, puis le vu — jamais la date seule', () => {
    const groupes = groupStoriesByAuthor(
      [
        story('vu', 'ancien', '2026-09-11T12:00:00Z'),      // le plus récent, mais VU
        story('neuf', 'ami', '2026-09-11T08:00:00Z'),        // plus vieux, NON vu
        story('mienne', 'moi', '2026-09-11T07:00:00Z'),      // la plus vieille, mais MIENNE
      ],
      { viewerId: 'moi', viewedIds: new Set(['vu']) },
    );
    expect(groupes.map((g) => g.authorId)).toEqual(['moi', 'ami', 'ancien']);
  });

  test('une story sans auteur ne fabrique aucun cercle fantôme', () => {
    const orpheline = { id: 'x', type: 'STORY', createdAt: '2026-09-11T10:00:00Z' } as StoryTrayPost;
    expect(groupStoriesByAuthor([orpheline], { viewerId: 'moi', viewedIds: new Set() })).toEqual([]);
  });

  test('une date illisible ne jette pas et ne passe pas devant', () => {
    const groupes = groupStoriesByAuthor(
      [story('bon', 'a', '2026-09-11T10:00:00Z'), story('cassé', 'b', 'pas une date')],
      { viewerId: undefined, viewedIds: new Set() },
    );
    expect(groupes.map((g) => g.authorId)).toEqual(['a', 'b']);
  });

  test('l\'anneau s\'éteint quand TOUTES les stories de l\'auteur sont vues', () => {
    const [groupe] = groupStoriesByAuthor(
      [story('s1', 'a', '2026-09-11T10:00:00Z'), story('s2', 'a', '2026-09-11T11:00:00Z')],
      { viewerId: 'moi', viewedIds: new Set(['s1', 's2']) },
    );
    expect(groupe?.hasUnseen).toBe(false);
  });

  test('il reste allumé tant qu\'UNE seule ne l\'est pas', () => {
    const [groupe] = groupStoriesByAuthor(
      [story('s1', 'a', '2026-09-11T10:00:00Z'), story('s2', 'a', '2026-09-11T11:00:00Z')],
      { viewerId: 'moi', viewedIds: new Set(['s1']) },
    );
    expect(groupe?.hasUnseen).toBe(true);
  });
});

describe('storyAuthorLabel', () => {
  test('la mienne se nomme, elle ne s\'identifie pas', () => {
    const [g] = groupStoriesByAuthor([story('s', 'moi', '2026-09-11T10:00:00Z')], {
      viewerId: 'moi',
      viewedIds: new Set(),
    });
    expect(storyAuthorLabel(g!)).toBe('Votre story');
  });

  test('le repli descend displayName → prénom nom → username, jamais l\'id', () => {
    const base = { id: 's', type: 'STORY', createdAt: '2026-09-11T10:00:00Z' };
    const avec = (author: Record<string, string>) =>
      storyAuthorLabel(
        groupStoriesByAuthor([{ ...base, author: { id: 'u', ...author } } as StoryTrayPost], {
          viewerId: 'moi',
          viewedIds: new Set(),
        })[0]!,
      );
    expect(avec({ displayName: 'Ada', username: 'ada42' })).toBe('Ada');
    expect(avec({ firstName: 'Ada', lastName: 'Lovelace', username: 'ada42' })).toBe('Ada Lovelace');
    expect(avec({ username: 'ada42' })).toBe('ada42');
  });
});
