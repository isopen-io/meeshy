import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_SLIDE_DURATION_MS,
  STORY_EXPIRY_MS,
  entryIndexFor,
  groupForPlayback,
  hasRenderableStoryContent,
  isStoryExpired,
  nextPosition,
  previousPosition,
  resolvePlayablePosition,
  resolvePosition,
  stableGroupOrder,
  type StoryPlaybackStory,
} from './playback';

const NOW = new Date('2026-09-13T12:00:00.000Z').getTime();

const story = (params: Partial<StoryPlaybackStory> & { readonly id: string; readonly authorId: string }): StoryPlaybackStory => ({
  id: params.id,
  author: { id: params.authorId },
  content: params.content ?? 'un contenu',
  createdAt: params.createdAt ?? '2026-09-13T09:00:00.000Z',
  ...(params.expiresAt === undefined ? {} : { expiresAt: params.expiresAt }),
  ...(params.isViewedByMe === undefined ? {} : { isViewedByMe: params.isViewedByMe }),
  ...(params.media === undefined ? {} : { media: params.media }),
  ...(params.storyEffects === undefined ? {} : { storyEffects: params.storyEffects }),
});

describe('constantes', () => {
  test('la durée par défaut d\'une slide statique est 6 secondes — parité Instagram/Snapchat', () => {
    expect(DEFAULT_SLIDE_DURATION_MS).toBe(6000);
  });

  test('l\'expiration par défaut est 20 heures', () => {
    expect(STORY_EXPIRY_MS).toBe(20 * 60 * 60 * 1000);
  });
});

describe('isStoryExpired', () => {
  test('une story sans expiresAt expire 20h après sa création', () => {
    const s = story({ id: 's', authorId: 'a', createdAt: '2026-09-12T15:00:00.000Z' });
    expect(isStoryExpired(s, NOW)).toBe(true); // 21h plus tard
  });

  test('une story sans expiresAt encore dans la fenêtre de 20h n\'est pas expirée', () => {
    const s = story({ id: 's', authorId: 'a', createdAt: '2026-09-13T11:00:00.000Z' });
    expect(isStoryExpired(s, NOW)).toBe(false);
  });

  test('expiresAt EXPLICITE prime sur le calcul par défaut', () => {
    const s = story({ id: 's', authorId: 'a', createdAt: '2026-09-13T11:00:00.000Z', expiresAt: '2026-09-13T11:30:00.000Z' });
    expect(isStoryExpired(s, NOW)).toBe(true);
  });
});

describe('hasRenderableStoryContent', () => {
  test('un contenu texte non blanc est restituable', () => {
    expect(hasRenderableStoryContent({ content: 'Bonjour' })).toBe(true);
  });

  test('un contenu blanc SEUL n\'est pas restituable', () => {
    expect(hasRenderableStoryContent({ content: '   ' })).toBe(false);
  });

  test('un média SEUL, sans texte, est restituable', () => {
    expect(hasRenderableStoryContent({ content: '', media: [{ id: 'm1' }] })).toBe(true);
  });

  test('un fond d\'effet SEUL est restituable', () => {
    expect(hasRenderableStoryContent({ content: '', storyEffects: { background: 'gradient:111111:222222' } })).toBe(true);
  });

  test('rien de tout ça — pas restituable', () => {
    expect(hasRenderableStoryContent({ content: '' })).toBe(false);
  });
});

describe('groupForPlayback', () => {
  test('les stories d\'un même auteur sont dans l\'ORDRE DE LECTURE — la plus ancienne d\'abord', () => {
    const [groupe] = groupForPlayback(
      [
        story({ id: 's2', authorId: 'a', createdAt: '2026-09-13T10:00:00.000Z' }),
        story({ id: 's1', authorId: 'a', createdAt: '2026-09-13T09:00:00.000Z' }),
      ],
      { viewerId: undefined },
    );
    expect(groupe?.stories.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  test('moi, puis le non-vu, puis le vu — jamais la date seule', () => {
    const groupes = groupForPlayback(
      [
        story({ id: 'vu', authorId: 'ancien', createdAt: '2026-09-13T11:00:00.000Z', isViewedByMe: true }),
        story({ id: 'neuf', authorId: 'ami', createdAt: '2026-09-13T08:00:00.000Z', isViewedByMe: false }),
        story({ id: 'mienne', authorId: 'moi', createdAt: '2026-09-13T07:00:00.000Z' }),
      ],
      { viewerId: 'moi' },
    );
    expect(groupes.map((g) => g.authorId)).toEqual(['moi', 'ami', 'ancien']);
  });

  test('une story sans auteur ne fabrique aucun groupe fantôme', () => {
    const orpheline = { id: 'x', content: 'x', createdAt: '2026-09-13T09:00:00.000Z' } as StoryPlaybackStory;
    expect(groupForPlayback([orpheline], { viewerId: undefined })).toEqual([]);
  });
});

describe('entryIndexFor', () => {
  test('la première non vue non expirée gagne', () => {
    const [groupe] = groupForPlayback(
      [
        story({ id: 's1', authorId: 'a', createdAt: '2026-09-13T09:00:00.000Z', isViewedByMe: true }),
        story({ id: 's2', authorId: 'a', createdAt: '2026-09-13T10:00:00.000Z', isViewedByMe: false }),
      ],
      { viewerId: undefined },
    );
    expect(entryIndexFor(groupe!, NOW)).toBe(1);
  });

  test('toutes vues ⇒ la première non expirée', () => {
    const [groupe] = groupForPlayback(
      [
        story({ id: 's1', authorId: 'a', createdAt: '2026-09-13T09:00:00.000Z', isViewedByMe: true }),
        story({ id: 's2', authorId: 'a', createdAt: '2026-09-13T10:00:00.000Z', isViewedByMe: true }),
      ],
      { viewerId: undefined },
    );
    expect(entryIndexFor(groupe!, NOW)).toBe(0);
  });

  test('tout expiré ⇒ repli sur 0', () => {
    const [groupe] = groupForPlayback(
      [story({ id: 's1', authorId: 'a', createdAt: '2026-09-10T09:00:00.000Z' })],
      { viewerId: undefined },
    );
    expect(entryIndexFor(groupe!, NOW)).toBe(0);
  });
});

describe('resolvePosition', () => {
  const groups = groupForPlayback(
    [
      story({ id: 'a1', authorId: 'a', createdAt: '2026-09-13T09:00:00.000Z' }),
      story({ id: 'a2', authorId: 'a', createdAt: '2026-09-13T10:00:00.000Z' }),
      story({ id: 'b1', authorId: 'b', createdAt: '2026-09-13T08:00:00.000Z' }),
    ],
    { viewerId: undefined },
  );

  test('trouve le groupe et l\'index d\'un post nommé — l\'intention "targetingStory"', () => {
    expect(resolvePosition(groups, 'b1')).toEqual({ groupIndex: groups.findIndex((g) => g.authorId === 'b'), storyIndex: 0 });
  });

  test('un id absent du corpus rend null', () => {
    expect(resolvePosition(groups, 'inconnu')).toBeNull();
  });
});

describe('nextPosition / previousPosition', () => {
  const groups = groupForPlayback(
    [
      story({ id: 'a1', authorId: 'a', createdAt: '2026-09-13T09:00:00.000Z' }),
      story({ id: 'a2', authorId: 'a', createdAt: '2026-09-13T10:00:00.000Z' }),
      story({ id: 'b1', authorId: 'b', createdAt: '2026-09-13T08:00:00.000Z' }),
    ],
    { viewerId: undefined },
  );
  const idxA = groups.findIndex((g) => g.authorId === 'a');
  const idxB = groups.findIndex((g) => g.authorId === 'b');

  test('avance d\'abord DANS le groupe', () => {
    expect(nextPosition(groups, { groupIndex: idxA, storyIndex: 0 }, NOW)).toEqual({ groupIndex: idxA, storyIndex: 1 });
  });

  test('épuisé le groupe, avance au groupe SUIVANT, à son entrée', () => {
    expect(nextPosition(groups, { groupIndex: idxA, storyIndex: 1 }, NOW)).toEqual({ groupIndex: idxB, storyIndex: 0 });
  });

  test('épuisé le dernier groupe, ferme', () => {
    expect(nextPosition(groups, { groupIndex: idxB, storyIndex: 0 }, NOW)).toBe('close');
  });

  test('recule d\'abord DANS le groupe', () => {
    expect(previousPosition(groups, { groupIndex: idxA, storyIndex: 1 })).toEqual({ groupIndex: idxA, storyIndex: 0 });
  });

  test('en tête de groupe, recule au groupe PRÉCÉDENT, à sa DERNIÈRE story', () => {
    expect(previousPosition(groups, { groupIndex: idxB, storyIndex: 0 })).toEqual({ groupIndex: idxA, storyIndex: 1 });
  });

  test('en tête du premier groupe, ne fait RIEN', () => {
    expect(previousPosition(groups, { groupIndex: idxA, storyIndex: 0 })).toBeNull();
  });
});

describe('resolvePlayablePosition — le saut des illisibles', () => {
  test('une story illisible (expirée) est SAUTÉE', () => {
    const groups = groupForPlayback(
      [
        story({ id: 'expiree', authorId: 'a', createdAt: '2026-09-10T09:00:00.000Z' }),
        story({ id: 'fraiche', authorId: 'a', createdAt: '2026-09-13T09:00:00.000Z' }),
      ],
      { viewerId: undefined },
    );
    expect(resolvePlayablePosition(groups, { groupIndex: 0, storyIndex: 0 }, NOW)).toEqual({ groupIndex: 0, storyIndex: 1 });
  });

  test('une story SANS contenu restituable est sautée', () => {
    const groups = groupForPlayback(
      [
        story({ id: 'vide', authorId: 'a', content: '', createdAt: '2026-09-13T08:00:00.000Z' }),
        story({ id: 'pleine', authorId: 'a', createdAt: '2026-09-13T09:00:00.000Z' }),
      ],
      { viewerId: undefined },
    );
    expect(resolvePlayablePosition(groups, { groupIndex: 0, storyIndex: 0 }, NOW)).toEqual({ groupIndex: 0, storyIndex: 1 });
  });

  test('le PROPRE groupe de l\'auteur n\'est JAMAIS sauté, même expiré', () => {
    const groups = groupForPlayback(
      [story({ id: 'ma-story-vieille', authorId: 'moi', createdAt: '2026-09-10T09:00:00.000Z' })],
      { viewerId: 'moi' },
    );
    expect(resolvePlayablePosition(groups, { groupIndex: 0, storyIndex: 0 }, NOW)).toEqual({ groupIndex: 0, storyIndex: 0 });
  });

  test('tout illisible ⇒ ferme', () => {
    const groups = groupForPlayback(
      [story({ id: 'expiree', authorId: 'a', createdAt: '2026-09-10T09:00:00.000Z' })],
      { viewerId: undefined },
    );
    expect(resolvePlayablePosition(groups, { groupIndex: 0, storyIndex: 0 }, NOW)).toBe('close');
  });
});

describe('stableGroupOrder — l\'ordre de lecture ne bouge pas sous le lecteur (#5817, revue-correction)', () => {
  const corpus = (viewedA: boolean): readonly StoryPlaybackStory[] => [
    story({ id: 'a1', authorId: 'anne', createdAt: '2026-09-13T10:00:00.000Z', isViewedByMe: viewedA }),
    story({ id: 'b1', authorId: 'bruno', createdAt: '2026-09-13T09:00:00.000Z', isViewedByMe: false }),
  ];

  test('SANS gel, marquer vu reclasse le groupe fini en queue — le lecteur ferme au lieu d\'avancer', () => {
    const avant = groupForPlayback(corpus(false), { viewerId: undefined });
    expect(avant.map((g) => g.authorId)).toEqual(['anne', 'bruno']);
    const apres = groupForPlayback(corpus(true), { viewerId: undefined });
    expect(apres.map((g) => g.authorId)).toEqual(['bruno', 'anne']);
    expect(nextPosition(apres, { groupIndex: 1, storyIndex: 0 }, NOW)).toBe('close');
  });

  test('AVEC gel, le corpus rafraîchi garde le rang d\'ouverture et `nextPosition` atteint l\'auteur suivant', () => {
    const ouverture = groupForPlayback(corpus(false), { viewerId: undefined });
    const gele = ouverture.map((g) => g.authorId);
    const apres = stableGroupOrder(groupForPlayback(corpus(true), { viewerId: undefined }), gele);
    expect(apres.map((g) => g.authorId)).toEqual(['anne', 'bruno']);
    expect(nextPosition(apres, { groupIndex: 0, storyIndex: 0 }, NOW)).toEqual({ groupIndex: 1, storyIndex: 0 });
  });

  test('un auteur APPARU pendant la lecture se range à la suite, sans réordonner les rangs gelés', () => {
    const frais = groupForPlayback(
      [
        ...corpus(true),
        story({ id: 'c1', authorId: 'chloe', createdAt: '2026-09-13T11:30:00.000Z', isViewedByMe: false }),
      ],
      { viewerId: undefined },
    );
    expect(stableGroupOrder(frais, ['anne', 'bruno']).map((g) => g.authorId)).toEqual(['anne', 'bruno', 'chloe']);
  });

  test('un gel VIDE rend le corpus tel quel — l\'ouverture n\'a encore rien figé', () => {
    const frais = groupForPlayback(corpus(true), { viewerId: undefined });
    expect(stableGroupOrder(frais, [])).toBe(frais);
  });
});
