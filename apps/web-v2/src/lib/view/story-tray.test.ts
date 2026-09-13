import { describe, expect, test } from 'bun:test';
import { groupStoriesByAuthor, storyAuthorLabel, withMoods } from './story-tray';
import type { StatusMoodPost, StoryTrayPost } from '@/lib/api/stories';

const story = (
  id: string,
  authorId: string,
  createdAt: string,
  nom?: string,
  isViewedByMe?: boolean,
): StoryTrayPost => ({
  id,
  type: 'STORY',
  createdAt,
  author: { id: authorId, username: nom ?? authorId },
  ...(isViewedByMe === undefined ? {} : { isViewedByMe }),
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

  test('isViewedByMe SERVI PAR LA PASSERELLE prime sur viewedIds (#5817, correctif du défaut § 2)', () => {
    const [groupe] = groupStoriesByAuthor(
      [story('s1', 'a', '2026-09-11T10:00:00Z', undefined, true)],
      { viewerId: 'moi', viewedIds: new Set() },
    );
    expect(groupe?.hasUnseen).toBe(false);
  });

  test('viewedIds reste un repli OPTIMISTE quand isViewedByMe est absent', () => {
    const [groupe] = groupStoriesByAuthor(
      [story('s1', 'a', '2026-09-11T10:00:00Z')],
      { viewerId: 'moi', viewedIds: new Set(['s1']) },
    );
    expect(groupe?.hasUnseen).toBe(false);
  });
});

describe('entryStoryId — porté PAR LE GROUPE (#5817, revue-correction)', () => {
  test('rend la PREMIÈRE story non vue', () => {
    const [groupe] = groupStoriesByAuthor(
      [
        story('vue', 'a', '2026-09-11T11:00:00Z', undefined, true),
        story('non-vue', 'a', '2026-09-11T10:00:00Z', undefined, false),
      ],
      { viewerId: undefined, viewedIds: new Set() },
    );
    expect(groupe!.entryStoryId).toBe('non-vue');
  });

  test('toutes vues ⇒ repli sur la PLUS ANCIENNE (ordre de LECTURE, pas l\'ordre du plateau)', () => {
    const [groupe] = groupStoriesByAuthor(
      [story('recente', 'a', '2026-09-11T11:00:00Z', undefined, true), story('ancienne', 'a', '2026-09-11T10:00:00Z', undefined, true)],
      { viewerId: undefined, viewedIds: new Set() },
    );
    // `groupe.stories` est trié DESC (ordre du plateau) : `stories[0]` est
    // « recente ». `entryStoryId` doit pourtant rendre « ancienne » — le
    // même ordre que `entryIndexFor` (`lib/stories/playback.ts`).
    expect(groupe!.stories[0]?.id).toBe('recente');
    expect(groupe!.entryStoryId).toBe('ancienne');
  });

  test('même en ordre de lecture, la première NON VUE gagne, pas la plus ancienne tout court', () => {
    const [groupe] = groupStoriesByAuthor(
      [
        story('ancienne-vue', 'a', '2026-09-11T09:00:00Z', undefined, true),
        story('recente-non-vue', 'a', '2026-09-11T11:00:00Z', undefined, false),
      ],
      { viewerId: undefined, viewedIds: new Set() },
    );
    expect(groupe!.entryStoryId).toBe('recente-non-vue');
  });
});

describe('l\'entrée suit l\'AVANCE OPTIMISTE, pas seulement le verdict serveur (#5817, revue-correction)', () => {
  test('une story marquée par `viewedIds` cesse d\'être l\'entrée du groupe', () => {
    const corpus = [
      story('s1', 'a', '2026-09-11T09:00:00Z'),
      story('s2', 'a', '2026-09-11T10:00:00Z'),
    ];
    expect(groupStoriesByAuthor(corpus, { viewerId: undefined, viewedIds: new Set() })[0]?.entryStoryId).toBe('s1');
    expect(groupStoriesByAuthor(corpus, { viewerId: undefined, viewedIds: new Set(['s1']) })[0]?.entryStoryId).toBe('s2');
  });

  test('un `isViewedByMe: false` SERVI ne peut pas rallumer une story qu\'on vient de voir', () => {
    // Le `false` de la passerelle est un INSTANTANÉ pris avant le POST que ce
    // lecteur vient d'émettre : l'union est monotone, jamais une priorité.
    const corpus = [
      story('s1', 'a', '2026-09-11T09:00:00Z', undefined, false),
      story('s2', 'a', '2026-09-11T10:00:00Z', undefined, false),
    ];
    const [groupe] = groupStoriesByAuthor(corpus, { viewerId: undefined, viewedIds: new Set(['s1', 's2']) });
    expect(groupe?.entryStoryId).toBe('s1');
    expect(groupe?.hasUnseen).toBe(false);
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

describe('withMoods', () => {
  const mood = (id: string, authorId: string, moodEmoji: string | null): StatusMoodPost => ({
    id,
    authorId,
    moodEmoji,
    author: { id: authorId, username: authorId },
  });

  test('un auteur qui a déjà une pastille reçoit son humeur', () => {
    const groupes = groupStoriesByAuthor([story('s1', 'a', '2026-09-11T10:00:00Z')], {
      viewerId: 'moi',
      viewedIds: new Set(),
    });
    const [g] = withMoods(groupes, [mood('m1', 'a', '🎉')]);
    expect(g?.moodEmoji).toBe('🎉');
  });

  test('un auteur sans humeur reste indéfini, jamais une chaîne vide', () => {
    const groupes = groupStoriesByAuthor([story('s1', 'a', '2026-09-11T10:00:00Z')], {
      viewerId: 'moi',
      viewedIds: new Set(),
    });
    const [g] = withMoods(groupes, [mood('m1', 'autre', '🎉')]);
    expect(g?.moodEmoji).toBeUndefined();
  });

  test('une humeur explicitement NULLE ne pose rien', () => {
    const groupes = groupStoriesByAuthor([story('s1', 'a', '2026-09-11T10:00:00Z')], {
      viewerId: 'moi',
      viewedIds: new Set(),
    });
    const [g] = withMoods(groupes, [mood('m1', 'a', null)]);
    expect(g?.moodEmoji).toBeUndefined();
  });

  test('seule la PREMIÈRE humeur du corpus compte — il est déjà trié du plus récent', () => {
    const groupes = groupStoriesByAuthor([story('s1', 'a', '2026-09-11T10:00:00Z')], {
      viewerId: 'moi',
      viewedIds: new Set(),
    });
    const [g] = withMoods(groupes, [mood('récente', 'a', '🎉'), mood('ancienne', 'a', '😴')]);
    expect(g?.moodEmoji).toBe('🎉');
  });

  test('un corpus vide rend les MÊMES groupes, jamais une copie', () => {
    const groupes = groupStoriesByAuthor([story('s1', 'a', '2026-09-11T10:00:00Z')], {
      viewerId: 'moi',
      viewedIds: new Set(),
    });
    expect(withMoods(groupes, [])).toBe(groupes);
  });
});
