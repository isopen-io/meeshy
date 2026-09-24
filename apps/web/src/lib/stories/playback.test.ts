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
  scopeToSingleGroup,
  slideDurationForScene,
  slideDurationMs,
  storyMediaUrl,
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

/**
 * **LA DURÉE D'UNE DIAPOSITIVE SUIT SON MÉDIA** (#6836).
 *
 * `DEFAULT_SLIDE_DURATION_MS` est un PLANCHER, jamais la réponse — mais
 * `story.tsx` divise l'écoulé par la constante sans jamais consulter le
 * média. Mesuré au navigateur sur `/story/st-video` : un clip de 3 s gèle sur
 * sa dernière trame pendant que la barre poursuit jusqu'à 100 %, et un clip
 * plus long que 6 s serait COUPÉ au milieu.
 *
 * La loi est celle d'iOS, déclarée source de vérité dans
 * `StoryViewerView+Content.swift` — ce portage ne conçoit rien :
 *
 *     max(durée du média, durée configurée, 6 s),
 *     puis arrondie au multiple SUPÉRIEUR de la période du média,
 *     « pour que la vidéo/audio bg ne soit JAMAIS coupée au milieu d'un cycle »
 *
 * L'arrondi est ce qui distingue cette loi d'un simple `max` : un clip de 4 s
 * sous un plancher de 6 s donne 8 s (deux cycles entiers), jamais 6 s — qui
 * couperait la seconde boucle en plein milieu.
 *
 * La durée du média est REÇUE, jamais lue : `StoryTrayMedia` ne sert aucune
 * durée (`stories.ts` — id, url, thumbnailUrl, mimeType), donc elle vient du
 * `<video>` lui-même à `loadedmetadata`. Même discipline que `now` dans ce
 * module : ce qui vient du monde est injecté par l'appelant.
 */
describe('slideDurationMs — la durée d’une diapositive suit son média (#6836)', () => {
  test('une diapositive SANS média dure le plancher', () => {
    expect(slideDurationMs({})).toBe(DEFAULT_SLIDE_DURATION_MS);
  });

  test('un clip PLUS COURT que le plancher tient le plancher, en cycles ENTIERS — 3 s ⇒ 6 s, deux boucles', () => {
    expect(slideDurationMs({ mediaDurationMs: 3000 })).toBe(6000);
  });

  test('un clip de 4 s sous un plancher de 6 s dure 8 s — jamais coupé au milieu du second cycle', () => {
    expect(slideDurationMs({ mediaDurationMs: 4000 })).toBe(8000);
  });

  test('un clip PLUS LONG que le plancher n’est JAMAIS tronqué', () => {
    expect(slideDurationMs({ mediaDurationMs: 10_000 })).toBe(10_000);
  });

  test('une durée CONFIGURÉE prime sur le plancher, et s’arrondit elle aussi au cycle', () => {
    expect(slideDurationMs({ configuredMs: 15_000 })).toBe(15_000);
    expect(slideDurationMs({ mediaDurationMs: 4000, configuredMs: 15_000 })).toBe(16_000);
  });

  test('une durée de média ABSURDE (nulle, négative, non finie) se rabat sur le plancher, sans boucle infinie', () => {
    expect(slideDurationMs({ mediaDurationMs: 0 })).toBe(DEFAULT_SLIDE_DURATION_MS);
    expect(slideDurationMs({ mediaDurationMs: -1 })).toBe(DEFAULT_SLIDE_DURATION_MS);
    expect(slideDurationMs({ mediaDurationMs: Number.NaN })).toBe(DEFAULT_SLIDE_DURATION_MS);
    expect(slideDurationMs({ mediaDurationMs: Number.POSITIVE_INFINITY })).toBe(DEFAULT_SLIDE_DURATION_MS);
  });
});

/**
 * `slideDurationForScene` (T4, #6899) — `timelineDuration` est AUTORITAIRE,
 * miroir de `StorySlide.computedTotalDuration()` (`StoryModels.swift:862-872`,
 * « PRIORITÉ 0 — autorité timeline : elle gagne sur le contenu (un média plus
 * long est rogné) »). La première forme la passait en `configuredMs` de
 * {@link slideDurationMs} — la loi du LEGACY `slideDuration`, qui prend le max
 * puis arrondit aux cycles du média : une story épinglée à 8 s sur une piste
 * de 30 s durait 30 s sur le web et 8 s sur iOS. Sans épingle, la loi du
 * contenu (`slideDurationMs`) reste la seule réponse.
 */
describe('slideDurationForScene — timelineDuration gouverne la diapositive (T4, #6899)', () => {
  test('timelineDuration seul, sans média ⇒ sa valeur en millisecondes', () => {
    expect(slideDurationForScene({ scene: { timelineDuration: 9 } })).toBe(9000);
  });

  test('timelineDuration=4s sous le plancher de 6 s ⇒ 4000 : l’épingle de l’auteur gagne', () => {
    expect(slideDurationForScene({ scene: { timelineDuration: 4 }, mediaDurationMs: 3000 })).toBe(4000);
  });

  test('timelineDuration=8s sur une piste de 30 s ⇒ 8000 : le média plus long est ROGNÉ, jamais la diapositive allongée', () => {
    expect(slideDurationForScene({ scene: { timelineDuration: 8 }, mediaDurationMs: 30_000 })).toBe(8000);
  });

  test('scène SANS timelineDuration ⇒ loi actuelle inchangée (slideDurationMs)', () => {
    expect(slideDurationForScene({ scene: {}, mediaDurationMs: 3000 })).toBe(slideDurationMs({ mediaDurationMs: 3000 }));
    expect(slideDurationForScene({ scene: {} })).toBe(slideDurationMs({}));
  });
});

/**
 * `storyMediaUrl` (#6899, revue-correction) — la passerelle sert `fileUrl`
 * (`mediaSelect`, `postIncludes.ts:104`, mesuré sur staging le 2026-09-17) ;
 * les fixtures historiques portaient `url`, qu'aucune réponse réelle ne sert.
 */
describe('storyMediaUrl — la clé servie par la passerelle d’abord', () => {
  test('`fileUrl` servi ⇒ c’est lui, même quand une vieille `url` traîne', () => {
    expect(storyMediaUrl({ fileUrl: '2026/09/a/photo.jpg', url: 'ancienne.jpg' })).toBe('2026/09/a/photo.jpg');
  });

  test('`fileUrl` absent, `null` ou vide ⇒ `url` des fixtures', () => {
    expect(storyMediaUrl({ url: 'fixture.jpg' })).toBe('fixture.jpg');
    expect(storyMediaUrl({ fileUrl: null, url: 'fixture.jpg' })).toBe('fixture.jpg');
    expect(storyMediaUrl({ fileUrl: '', url: 'fixture.jpg' })).toBe('fixture.jpg');
  });

  test('aucune des deux ⇒ chaîne vide, jamais `undefined`', () => {
    expect(storyMediaUrl({})).toBe('');
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

  // T8 (#6899) — un document v3 texte-seul (aucun `content` ni `media` de
  // post, § O3 : « un canvas sans scène n'est jamais un canvas ») est
  // RESTITUABLE — sans ce vecteur, `resolvePlayablePosition` SAUTE une story
  // de scène texte-seul comme si elle était vide.
  test('un document v3 dont une scène porte un objet visible est restituable, même sans content ni media', () => {
    expect(
      hasRenderableStoryContent({
        content: '',
        storyEffects: {
          v: 3,
          scenes: [{ id: 's1', objects: [{ id: 't1', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 0, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { text: 'x' } }] }],
        },
      }),
    ).toBe(true);
  });

  test('un document v3 sans scène (`scenes: []`) n’est pas restituable par lui-même', () => {
    expect(hasRenderableStoryContent({ content: '', storyEffects: { v: 3, scenes: [] } })).toBe(false);
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

describe('scopeToSingleGroup — la portée « un seul groupe » (revue de #6149, défaut majeur 3)', () => {
  const groups = groupForPlayback(
    [
      story({ id: 'a1', authorId: 'a', createdAt: '2026-09-13T09:00:00.000Z' }),
      story({ id: 'a2', authorId: 'a', createdAt: '2026-09-13T10:00:00.000Z' }),
      story({ id: 'b1', authorId: 'b', createdAt: '2026-09-13T08:00:00.000Z' }),
    ],
    { viewerId: undefined },
  );

  test('restreint le tableau au SEUL groupe qui porte la story ouverte', () => {
    const scoped = scopeToSingleGroup(groups, 'a1');
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.authorId).toBe('a');
  });

  test('épuisé le seul groupe restant, `nextPosition` FERME — il ne passe plus à l\'auteur suivant', () => {
    const scoped = scopeToSingleGroup(groups, 'a1');
    expect(nextPosition(scoped, { groupIndex: 0, storyIndex: 1 }, NOW)).toBe('close');
  });

  test('un id absent du corpus rend le tableau INCHANGÉ — jamais un lecteur vide', () => {
    expect(scopeToSingleGroup(groups, 'inconnu')).toBe(groups);
  });

  test('le groupIndex ORIGINAL ne fuit pas : la story ciblée est retrouvée à l\'index 0 du tableau restreint', () => {
    const scoped = scopeToSingleGroup(groups, 'a2');
    expect(resolvePosition(scoped, 'a2')).toEqual({ groupIndex: 0, storyIndex: 1 });
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
