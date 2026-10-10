import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';
import { publishStory } from '@/lib/api/stories-publish';

import {
  armedPublishChoice,
  companionReelOffered,
  publishChoiceTitleKey,
  publishedKinds,
  toggledPublishChoice,
} from './publish-also-as-reel';
import type { PublishChoice } from './publication-layout';
import { buildStoryCanvasEffects, studioMediaIds } from './story-document';
import { emptyStudioDraft, withAddedPage, withSound, withText, withVisual, type StudioDraft } from './studio';
import { alsoAsReelTravels, publishStudioPlan } from './studio-publish-flow';
import type { StudioPublication } from './studio-publish';
import { IDENTITY_POSE } from './studio-pose';

/**
 * « UNE STORY PART AUSSI EN RÉEL, D'UN SEUL GESTE » (#9476) — miroir de
 * `ComposerPublishAlsoAsReelTests` (iOS). Le porteur a publié une story
 * (photo, texte, son emprunté de 238 s) qu'il voulait aussi en réel : un seul
 * `POST /posts` `type: STORY` est parti.
 */

const ready = { phase: 'ready', postMediaId: 'pm-1', fileUrl: 'f.jpg' } as const;

const photo = (draft: StudioDraft): StudioDraft =>
  withVisual(draft, 'visual', { previewUrl: 'blob:photo', mediaType: 'image', upload: ready, caption: '', pose: IDENTITY_POSE });

/** La story du porteur : une photo, un texte, un son de 238 s. */
const storyDuPorteur = (): StudioDraft =>
  withSound(photo(withText(emptyStudioDraft('fr'), 'text-1', 'Le marché ce matin')), {
    previewUrl: 'blob:son',
    upload: { phase: 'ready', postMediaId: 'pm-son', fileUrl: 's.m4a' },
    plane: 'background',
    durationMs: 238_000,
  });

const photoSeule = (): StudioDraft => photo(withText(emptyStudioDraft('fr'), 'text-1', 'Bonjour'));

const story: PublishChoice = { kind: 'STORY', layout: null };
const reel: PublishChoice = { kind: 'REEL', layout: null };
const storyEtReel: PublishChoice = { kind: 'STORY', layout: null, alsoAsReel: true };

describe('companionReelOffered — quand la story peut partir aussi en réel', () => {
  test('la story du porteur (son de 238 s) offre les deux formats', () => {
    expect(companionReelOffered({ draft: storyDuPorteur(), editing: false })).toBe(true);
  });

  test('une photo seule ne qualifie pas le réel : aucune offre', () => {
    expect(companionReelOffered({ draft: photoSeule(), editing: false })).toBe(false);
  });

  test('deux pages partiraient en deux réels : aucune offre', () => {
    const deuxPages = photo(withAddedPage(storyDuPorteur(), 'fr'));
    expect(companionReelOffered({ draft: deuxPages, editing: false })).toBe(false);
  });

  test('modifier une publication existante n’en crée jamais une seconde', () => {
    expect(companionReelOffered({ draft: storyDuPorteur(), editing: true })).toBe(false);
  });
});

describe('le menu coche les DEUX formats', () => {
  test('toucher Réel sur une story AJOUTE le réel ; le retoucher le retire', () => {
    expect(toggledPublishChoice('REEL', story, true)).toEqual(storyEtReel);
    expect(toggledPublishChoice('REEL', storyEtReel, true)).toEqual(story);
  });

  test('décocher la story garde le réel — jamais un menu sans rien de coché', () => {
    expect(toggledPublishChoice('STORY', storyEtReel, true)).toEqual(reel);
    expect(toggledPublishChoice('STORY', reel, true)).toEqual(storyEtReel);
  });

  test('Post arme le post seul ; sans offre, Réel arme le réel seul, comme avant', () => {
    expect(toggledPublishChoice('POST', storyEtReel, true)).toEqual({ kind: 'POST', layout: null });
    expect(toggledPublishChoice('REEL', story, false)).toEqual(reel);
  });

  test('la coche suit ce qui part', () => {
    expect(publishedKinds(storyEtReel)).toEqual(['STORY', 'REEL']);
    expect(publishedKinds(reel)).toEqual(['REEL']);
  });
});

describe('rien n’annonce un réel qui ne partirait pas', () => {
  test('le réel ne survit que sous l’offre', () => {
    expect(armedPublishChoice(storyEtReel, true)).toEqual(storyEtReel);
    expect(armedPublishChoice(storyEtReel, false)).toEqual(story);
  });

  test('la capsule nomme les deux formats, ou le seul', () => {
    expect(publishChoiceTitleKey(storyEtReel)).toBe('story.studio.publish.as.storyAndReel');
    expect(publishChoiceTitleKey(armedPublishChoice(storyEtReel, false))).toBe('story.studio.publish.as.story');
    expect(publishChoiceTitleKey(reel)).toBe('story.studio.publish.as.reel');
  });

  test('le fil ne porte le réel que sur une story d’UNE publication', () => {
    expect(alsoAsReelTravels({ kind: 'STORY', requested: true, publicationCount: 1 })).toBe(true);
    expect(alsoAsReelTravels({ kind: 'STORY', requested: true, publicationCount: 2 })).toBe(false);
    expect(alsoAsReelTravels({ kind: 'REEL', requested: true, publicationCount: 1 })).toBe(false);
    expect(alsoAsReelTravels({ kind: 'STORY', requested: false, publicationCount: 1 })).toBe(false);
  });
});

function fakeFetch() {
  const bodies: Array<Record<string, unknown>> = [];
  const impl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ success: true, data: { id: 'story-1' } }), { status: 201 });
  }) as typeof fetch;
  return { transport: createHttpTransport({ base: '', fetchImpl: impl }), bodies };
}

const BACKGROUND = { postMediaId: 'pm-bg', fileUrl: '2026/10/u1/bg.jpg' } as const;
const publication = (): StudioPublication => ({
  pageIds: ['page-1'],
  hasText: false,
  storyEffects: buildStoryCanvasEffects({ texts: [], background: { source: BACKGROUND, mediaType: 'image' } })!,
  mediaIds: studioMediaIds([{ background: BACKGROUND }]),
});

describe('ce qui part sur POST /posts', () => {
  test('un client qui ne demande rien n’envoie PAS la clé — le corps historique', async () => {
    const { transport, bodies } = fakeFetch();
    await publishStory({ source: 'gateway', transport, storyEffects: publication().storyEffects, mediaIds: publication().mediaIds });
    expect(Object.hasOwn(bodies[0] ?? {}, 'alsoAsReel')).toBe(false);
  });

  test('la story accompagnée part en STORY avec `alsoAsReel: true`, en UNE requête', async () => {
    const { transport, bodies } = fakeFetch();
    const outcome = await publishStudioPlan({
      plan: { kind: 'ready', publications: [publication()] },
      api: { source: 'gateway', transport },
      kind: 'STORY',
      visibility: null,
      language: 'fr',
      alsoAsReel: true,
    });
    expect(outcome.kind).toBe('published');
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.type).toBe('STORY');
    expect(bodies[0]?.alsoAsReel).toBe(true);
  });

  test('un réel armé part en REEL, sans la clé', async () => {
    const { transport, bodies } = fakeFetch();
    await publishStudioPlan({
      plan: { kind: 'ready', publications: [publication()] },
      api: { source: 'gateway', transport },
      kind: 'REEL',
      visibility: null,
      language: 'fr',
      alsoAsReel: true,
    });
    expect(bodies[0]?.type).toBe('REEL');
    expect(Object.hasOwn(bodies[0] ?? {}, 'alsoAsReel')).toBe(false);
  });
});
