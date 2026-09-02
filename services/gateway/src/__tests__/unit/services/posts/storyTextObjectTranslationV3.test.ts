/**
 * A7b — le pipeline de traduction des objets texte parle v3 (revue totale C6).
 *
 * Un document `v:3` range ses textes dans `scenes[].objects[kind=text]` :
 * l'ancien chemin de persistance `storyEffects.textObjects.$i.translations.$lang`
 * y est MORT (il crée un champ orphelin qu'aucun lecteur ne lit).
 *
 * Pins :
 *  1. post v3 en base + traduction reçue ⇒ le `$set` Mongo vise
 *     `storyEffects.scenes.$s.objects.$o.payload.translations.$lang`, l'objet
 *     ciblé PAR ID (l'index d'objet dans la scène, jamais l'index texte aveugle).
 *  2. post v1 ⇒ le `$set` actuel `storyEffects.textObjects.$i.translations.$lang`
 *     inchangé (non-régression archive).
 *  3. le trigger de création se déclenche pour un doc v3 dont un objet text a
 *     du contenu (il lisait `effects.textObjects`, vide dans un doc v3).
 *  4. l'index de recherche composé (`composeStoryContent`) intègre les textes v3.
 *  + `translationSetPath` testé à sec (résolveur pur).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  translationSetPath,
  storyTranslatableTexts,
} from '../../../../services/posts/storyEffectsV3';
import { composeStoryContent } from '../../../../services/posts/storyContentComposition';
import { StoryTextObjectTranslationService } from '../../../../services/posts/StoryTextObjectTranslationService';
import { PostService } from '../../../../services/PostService';
import { ZMQSingleton } from '../../../../services/ZmqSingleton';
import type { TrackingLinkService } from '../../../../services/TrackingLinkService';

const POST_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439099';

// ─── Documents ────────────────────────────────────────────────────────────────

/** Doc v3 : l'objet texte est le SECOND objet de la scène (index objet 1),
 *  mais le PREMIER texte (index texte plat 0) — le piège de l'index aveugle. */
const v3Doc = () => ({
  v: 3,
  scenes: [
    {
      id: 's1',
      objects: [
        {
          id: 'm1',
          kind: 'media',
          anchor: { t: 'free', x: 0.5, y: 0.5 },
          plane: 'content',
          z: 0,
          transform: { scale: 1, rotation: 0, opacity: 1 },
          payload: { postMediaId: 'pm1' },
        },
        {
          id: 't1',
          kind: 'text',
          anchor: { t: 'free', x: 0.5, y: 0.4 },
          plane: 'fg',
          z: 1,
          locale: 'fr',
          transform: { scale: 1, rotation: 0, opacity: 1 },
          payload: { text: 'Bonjour', textStyle: 'bold' },
        },
      ],
    },
  ],
});

const v1Doc = () => ({
  textObjects: [{ id: 'a', text: 'Bonjour', sourceLanguage: 'fr' }],
});

/** Doc d'un rang SUPÉRIEUR, DÉRIVÉ du v3 pour qu'il ne puisse pas en diverger
 *  (#4774). Au rang 3, `v === 3` et `v >= 3` rendent le même verdict — un
 *  témoin posé là ne peut pas tomber. C'est au rang 4 que les deux prédicats
 *  se séparent, et c'est le seul endroit où ce défaut se voit. */
const v4Doc = () => ({ ...v3Doc(), v: 4 });

// ─── translationSetPath (résolveur pur, à sec) ───────────────────────────────

describe('translationSetPath — résolveur de chemin v3 par id', () => {
  it('resolves the object by ID inside its scene (never the blind text index)', () => {
    expect(translationSetPath(v3Doc(), 't1', 'en')).toBe(
      'storyEffects.scenes.0.objects.1.payload.translations.en',
    );
  });

  it('returns null for a v1 blob', () => {
    expect(translationSetPath(v1Doc(), 't1', 'en')).toBeNull();
  });

  it('returns null when the id is absent from the document', () => {
    expect(translationSetPath(v3Doc(), 'ghost', 'en')).toBeNull();
  });
});

// ─── storyTranslatableTexts + composeStoryContent (test 4) ───────────────────

describe('storyTranslatableTexts — énumération des textes des deux formes', () => {
  it('v3: enumerates scenes[].objects[kind=text] with text/sourceLanguage mapped', () => {
    const texts = storyTranslatableTexts(v3Doc());
    expect(texts).toHaveLength(1);
    expect(texts?.[0]).toMatchObject({ id: 't1', text: 'Bonjour', sourceLanguage: 'fr' });
  });

  it('v1: passes textObjects through unchanged', () => {
    expect(storyTranslatableTexts(v1Doc())).toEqual(v1Doc().textObjects);
  });

  it('composeStoryContent integrates the v3 texts (search index)', () => {
    const doc = v3Doc();
    (doc.scenes[0].objects as Array<Record<string, unknown>>).push({
      id: 't2',
      kind: 'text',
      anchor: { t: 'free', x: 0.5, y: 0.8 },
      plane: 'fg',
      z: 2,
      transform: { scale: 1, rotation: 0, opacity: 1 },
      payload: { text: 'le monde' },
    });
    expect(composeStoryContent(storyTranslatableTexts(doc))).toBe('Bonjour le monde');
  });
});

// ─── Persistance (tests 1 & 2) ───────────────────────────────────────────────

type PostRow = {
  authorId: string;
  visibility: string;
  visibilityUserIds: string[];
  content: string | null;
  storyEffects: unknown;
};

const makeTranslationService = (post: PostRow) => {
  const prisma = {
    post: { findUnique: jest.fn(async () => post) },
    friendRequest: { findMany: jest.fn(async () => []) },
    $runCommandRaw: jest.fn(async () => ({ ok: 1 })),
  };
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  // @ts-expect-error accessing private static to reset the singleton
  StoryTextObjectTranslationService._shared = null;
  const service = StoryTextObjectTranslationService.init(
    prisma as unknown as Parameters<typeof StoryTextObjectTranslationService.init>[0],
    io as unknown as Parameters<typeof StoryTextObjectTranslationService.init>[1],
  );
  return { service, prisma };
};

const setFieldsOf = (prisma: { $runCommandRaw: jest.Mock }): Record<string, unknown> => {
  const cmd = prisma.$runCommandRaw.mock.calls[0]?.[0] as
    | { updates?: Array<{ u?: { $set?: Record<string, unknown> } }> }
    | undefined;
  return cmd?.updates?.[0]?.u?.$set ?? {};
};

describe('StoryTextObjectTranslationService.handleTranslationCompleted — persistance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('v3 doc: $set targets scenes.$s.objects.$o.payload.translations.$lang (object resolved by id)', async () => {
    const { service, prisma } = makeTranslationService({
      authorId: USER_ID,
      visibility: 'PRIVATE',
      visibilityUserIds: [],
      content: 'Bonjour',
      storyEffects: v3Doc(),
    });

    await service.handleTranslationCompleted({
      postId: POST_ID,
      textObjectIndex: 0,
      translations: { en: 'Hello' },
    });

    const setFields = setFieldsOf(prisma);
    expect(setFields['storyEffects.scenes.0.objects.1.payload.translations.en']).toBe('Hello');
    expect(
      Object.keys(setFields).filter((k) => k.startsWith('storyEffects.textObjects.')),
    ).toEqual([]);
  });

  it("doc d'un rang SUPÉRIEUR : le $set vise SA scène, il ne grave pas une forme v1 dans un document v3+ (#4774)", async () => {
    const { service, prisma } = makeTranslationService({
      authorId: USER_ID,
      visibility: 'PRIVATE',
      visibilityUserIds: [],
      content: 'Bonjour',
      storyEffects: v4Doc(),
    });

    await service.handleTranslationCompleted({
      postId: POST_ID,
      textObjectIndex: 0,
      translations: { en: 'Hello' },
    });

    const setFields = setFieldsOf(prisma);
    expect(setFields['storyEffects.scenes.0.objects.1.payload.translations.en']).toBe('Hello');
    // Le point du témoin : sous le prédicat STRICT, ce document repartait par
    // le chemin v1 et GRAVAIT `storyEffects.textObjects.0.translations.en` dans
    // un document qui n'a pas de `textObjects`. Une corruption, pas un affichage
    // manquant — et aucun lecteur ne relit jamais ce champ orphelin.
    expect(
      Object.keys(setFields).filter((k) => k.startsWith('storyEffects.textObjects.')),
    ).toEqual([]);
  });

  it('v1 doc: the current textObjects path is unchanged (archive non-regression)', async () => {
    const { service, prisma } = makeTranslationService({
      authorId: USER_ID,
      visibility: 'PRIVATE',
      visibilityUserIds: [],
      content: 'Bonjour',
      storyEffects: v1Doc(),
    });

    await service.handleTranslationCompleted({
      postId: POST_ID,
      textObjectIndex: 0,
      translations: { en: 'Hello' },
    });

    const setFields = setFieldsOf(prisma);
    expect(setFields['storyEffects.textObjects.0.translations.en']).toBe('Hello');
    expect(
      Object.keys(setFields).filter((k) => k.startsWith('storyEffects.scenes.')),
    ).toEqual([]);
  });

  it('v3 doc: the derived search index is recomposed from the v3 texts', async () => {
    const { service, prisma } = makeTranslationService({
      authorId: USER_ID,
      visibility: 'PRIVATE',
      visibilityUserIds: [],
      content: 'Bonjour',
      storyEffects: v3Doc(),
    });

    await service.handleTranslationCompleted({
      postId: POST_ID,
      textObjectIndex: 0,
      translations: { en: 'Hello' },
    });

    const derived = setFieldsOf(prisma)['translations.en'] as { text: string } | undefined;
    expect(derived?.text).toBe('Hello');
  });
});

// ─── Trigger de création (tests 3 & 4 côté PostService) ──────────────────────

const noopTracking = {
  collectContentTrackingLinks: jest
    .fn<TrackingLinkService['collectContentTrackingLinks']>()
    .mockResolvedValue([]),
} as unknown as TrackingLinkService;

const buildPrisma = (contactLanguages: Array<string | null> = []) => {
  const post = {
    create: jest
      .fn<(arg?: unknown) => Promise<{ id: string; authorId: string; metadata: unknown }>>()
      .mockResolvedValue({ id: POST_ID, authorId: USER_ID, metadata: null }),
    update: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({}),
    findUnique: jest
      .fn<(arg?: unknown) => Promise<unknown>>()
      .mockResolvedValue({ id: POST_ID, authorId: USER_ID }),
    findFirst: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue(null),
  };
  const participant = {
    findMany: jest
      .fn<(arg?: unknown) => Promise<Array<{ user: { systemLanguage: string | null } }>>>()
      .mockResolvedValue(contactLanguages.map((l) => ({ user: { systemLanguage: l } }))),
  };
  return { post, participant } as unknown as ConstructorParameters<typeof PostService>[0] & {
    post: typeof post;
    participant: typeof participant;
  };
};

const makePostService = (prisma: ReturnType<typeof buildPrisma>) =>
  new PostService(
    prisma as unknown as ConstructorParameters<typeof PostService>[0],
    undefined,
    undefined,
    undefined,
    noopTracking,
  );

describe('PostService.createPost — déclenchement pour un doc v3', () => {
  let translateSpy: jest.Mock;

  beforeEach(() => {
    translateSpy = jest.fn();
    jest
      .spyOn(ZMQSingleton, 'getInstanceSync')
      .mockReturnValue({ translateTextObject: translateSpy } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fires the ZMQ translation job for a v3 text object (was reading effects.textObjects only)', async () => {
    const prisma = buildPrisma(['es']);

    await makePostService(prisma).createPost(
      { type: 'STORY', visibility: 'PUBLIC', storyEffects: v3Doc() } as never,
      USER_ID,
    );

    expect(translateSpy).toHaveBeenCalledTimes(1);
    expect(translateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: POST_ID,
        textObjectIndex: 0,
        text: 'Bonjour',
        sourceLanguage: 'fr',
        targetLanguages: ['es'],
      }),
    );
  });

  /**
   * **INVERSÉ le 2026-09-02** (#4502). Il assertait `content === 'Bonjour'` —
   * la recopie, que la directive porteur du 2026-08-30 a révoquée. Retourné
   * plutôt que supprimé : une propriété révoquée sans témoin revient par le
   * premier lot qui trouve la recopie commode.
   *
   * Le cas v3 vaut d'être gardé à part : c'est la forme que produit le composer
   * v3, donc toutes les stories NEUVES — un retour de la recopie s'y verrait en
   * premier.
   */
  it('n’écrit AUCUN content dérivé des textes v3 (#4502)', async () => {
    const prisma = buildPrisma();

    await makePostService(prisma).createPost(
      { type: 'STORY', visibility: 'PUBLIC', storyEffects: v3Doc() } as never,
      USER_ID,
    );

    const contentWrite = prisma.post.update.mock.calls
      .map((c) => c[0] as { data?: { content?: string } })
      .find((arg) => arg?.data?.content !== undefined);
    expect(contentWrite).toBeUndefined();
  });
});
