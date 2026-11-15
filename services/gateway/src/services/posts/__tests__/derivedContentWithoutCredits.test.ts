/**
 * @jest-environment node
 *
 * #10523 — le `content` d'une story publiée AVANT #4502 est la concaténation
 * des textes de son canvas, puce « Reposté de @auteur » comprise, et ses
 * `translations` en sont l'assemblage. Le canvas est servi sans la puce
 * (#10524) : le `content` et ses traductions le sont aussi, partout où ils
 * partent — la projection des posts, l'extrait d'une notification, le texte
 * des signaux et la recomposition des traductions.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { withMentions } from '../postReferences';
import { derivedContentWithoutCredits, postSignalText } from '../storyContentComposition';
import { StoryTextObjectTranslationService } from '../StoryTextObjectTranslationService';
import { servePostExcerpt } from '../../notifications/served-post-excerpt';
import { WIRE_BROADCAST } from '../storyEffectsV3';

const CREDIT = 'Reposté de @ada';
const CREDIT_EN = 'Reposted from @ada';

const v1Effects = () => ({
  textObjects: [
    { id: 'credit', text: CREDIT, isLocked: true, translations: { en: CREDIT_EN } },
    { id: 'mine', text: 'Bonjour', translations: { en: 'Hello' } },
    { id: 'more', text: 'le monde' },
  ],
});

const v3Effects = () => ({
  v: 3,
  scenes: [
    {
      id: 'scene-1',
      objects: [
        { id: 'credit', kind: 'text', payload: { text: CREDIT, isLocked: true, translations: { en: CREDIT_EN } } },
        { id: 'photo', kind: 'media', payload: { postMediaId: 'm1', isLocked: true } },
        { id: 'mine', kind: 'text', payload: { text: 'Bonjour', translations: { en: 'Hello' } } },
        { id: 'more', kind: 'text', payload: { text: 'le monde' } },
      ],
    },
  ],
});

const DERIVED = `${CREDIT} Bonjour le monde`;

type ServedRow = Record<string, unknown>;
const serve = (post: ServedRow): ServedRow => withMentions(post, WIRE_BROADCAST);

const derivedTranslations = () => ({
  en: { text: `${CREDIT_EN} Hello le monde`, translationModel: 'story-text-objects', confidenceScore: 1, createdAt: '2026-08-01T00:00:00.000Z' },
  es: { text: 'Republicado de @ada Hola el mundo', translationModel: 'nllb', confidenceScore: 0.9, createdAt: '2026-07-01T00:00:00.000Z' },
});

describe.each([
  ['v1 (textObjects)', v1Effects],
  ['v3 (scenes[].objects)', v3Effects],
])('derivedContentWithoutCredits — canvas %s', (_label, effects) => {
  it('retire le texte de la puce du content dérivé', () => {
    const served = derivedContentWithoutCredits({ content: DERIVED, translations: derivedTranslations(), storyEffects: effects() });

    expect(served?.content).toBe('Bonjour le monde');
  });

  it('recompose chaque traduction depuis les textes qui restent, et garde ses autres champs', () => {
    const served = derivedContentWithoutCredits({ content: DERIVED, translations: derivedTranslations(), storyEffects: effects() });

    expect(served?.translations).toEqual({
      en: { text: 'Hello le monde', translationModel: 'story-text-objects', confidenceScore: 1, createdAt: '2026-08-01T00:00:00.000Z' },
    });
  });

  it('ne sert pas une traduction qu’aucun texte restant ne peut recomposer', () => {
    const served = derivedContentWithoutCredits({ content: DERIVED, translations: derivedTranslations(), storyEffects: effects() });

    expect(JSON.stringify(served)).not.toContain('@ada');
    expect(served?.translations).not.toHaveProperty('es');
  });

  it('laisse une vraie légende d’auteur intacte, même si elle cite le crédit', () => {
    const caption = `Ma légende — ${CREDIT}`;

    expect(derivedContentWithoutCredits({ content: caption, translations: derivedTranslations(), storyEffects: effects() })).toBeNull();
  });

  it('ne touche à rien sans puce dans le canvas', () => {
    const noCredit = serve({ storyEffects: effects() })['storyEffects'];

    expect(derivedContentWithoutCredits({ content: 'Bonjour le monde', translations: {}, storyEffects: noCredit })).toBeNull();
  });
});

describe('derivedContentWithoutCredits — bords', () => {
  it('rend un content nul quand la puce était le seul texte', () => {
    const served = derivedContentWithoutCredits({
      content: CREDIT,
      translations: { en: { text: CREDIT_EN } },
      storyEffects: { textObjects: [{ text: CREDIT, isLocked: true, translations: { en: CREDIT_EN } }] },
    });

    expect(served).toEqual({ content: null, translations: {} });
  });

  it('ne fabrique pas de translations quand la ligne lue n’en charge pas', () => {
    const served = derivedContentWithoutCredits({ content: DERIVED, storyEffects: v1Effects() });

    expect(served).toEqual({ content: 'Bonjour le monde' });
  });

  it.each([null, undefined, '', 42])('ignore un content %p', (content) => {
    expect(derivedContentWithoutCredits({ content, storyEffects: v1Effects() })).toBeNull();
  });
});

describe('withMentions — la projection servie', () => {
  it('sert le content et les traductions d’une ancienne story sans le texte de la puce', () => {
    const served = serve({ id: 'p1', content: DERIVED, translations: derivedTranslations(), storyEffects: v1Effects() });

    expect(served['content']).toBe('Bonjour le monde');
    expect(JSON.stringify(served)).not.toContain('@ada');
  });

  it('sert de même la source citée par une republication', () => {
    const served = serve({
      id: 'p2',
      content: 'Ma citation',
      repostOf: { id: 'p1', content: DERIVED, translations: derivedTranslations(), storyEffects: v3Effects() },
    });

    expect(served['content']).toBe('Ma citation');
    expect((served['repostOf'] as ServedRow)['content']).toBe('Bonjour le monde');
    expect(JSON.stringify(served)).not.toContain('@ada');
  });

  it('est idempotente : un post déjà servi repasse sans changer', () => {
    const once = serve({ id: 'p1', content: DERIVED, translations: derivedTranslations(), storyEffects: v1Effects() });

    expect(serve(once)).toEqual(once);
  });

  it('rend à l’identique un post dont le content n’a rien à retirer', () => {
    const post = { id: 'p3', content: 'Une légende', translations: {}, storyEffects: { textObjects: [{ text: 'Bonjour' }] } };

    const served = serve(post);

    expect(served['content']).toBe('Une légende');
    expect(served['translations']).toBe(post.translations);
  });
});

describe('postSignalText — une ancienne story', () => {
  it('ne donne jamais le texte de la puce aux signaux', () => {
    expect(postSignalText({ content: DERIVED, storyEffects: v1Effects() })).toBe('Bonjour le monde');
  });

  it('ne rend rien quand la puce était le seul texte', () => {
    expect(postSignalText({
      content: CREDIT,
      storyEffects: { textObjects: [{ text: CREDIT, isLocked: true }] },
    })).toBeUndefined();
  });
});

describe('servePostExcerpt — l’extrait d’une notification', () => {
  const source = (overrides: Record<string, unknown> = {}) => ({
    content: DERIVED,
    originalLanguage: 'fr',
    translations: derivedTranslations(),
    storyEffects: v1Effects(),
    deletedAt: null,
    expiresAt: null,
    ...overrides,
  });
  const now = new Date('2026-10-13T00:00:00.000Z');

  it('sert l’original sans le texte de la puce', () => {
    expect(servePostExcerpt({ source: source(), preferredLanguages: ['fr'], now })).toBe('Bonjour le monde');
  });

  it('sert la traduction recomposée sans le texte de la puce', () => {
    expect(servePostExcerpt({ source: source(), preferredLanguages: ['en'], now })).toBe('Hello le monde');
  });

  it('retombe sur l’original quand la traduction ne se recompose pas', () => {
    expect(servePostExcerpt({ source: source(), preferredLanguages: ['es'], now })).toBe('Bonjour le monde');
  });
});

describe('StoryTextObjectTranslationService — la recomposition des traductions', () => {
  type RawCommand = { updates: Array<{ u: { $set: Record<string, unknown> } }> };

  const makeService = (post: Record<string, unknown>) => {
    const runCommand = jest.fn(async (_command: RawCommand) => ({ ok: 1 }));
    const emit = jest.fn((_event: string, _data: unknown) => true);
    const prisma = {
      post: { findUnique: jest.fn(async (_args: unknown) => post) },
      friendRequest: { findMany: jest.fn(async (_args: unknown) => []) },
      $runCommandRaw: runCommand,
    };
    const io = { to: jest.fn((_room: string) => ({ emit })) };
    const service = StoryTextObjectTranslationService.init(
      prisma as unknown as Parameters<typeof StoryTextObjectTranslationService.init>[0],
      io as unknown as Parameters<typeof StoryTextObjectTranslationService.init>[1],
    );
    return { service, runCommand, emit };
  };

  const oldStory = (storyEffects: unknown) => ({
    authorId: 'author-1',
    visibility: 'ONLY',
    visibilityUserIds: [],
    content: DERIVED,
    storyEffects,
  });

  it.each([
    ['v1', v1Effects],
    ['v3', v3Effects],
  ])('n’assemble pas le texte de la puce dans translations.<langue> (%s)', async (_label, effects) => {
    const { service, runCommand, emit } = makeService(oldStory(effects()));
    const flatIndexOfMore = 2;

    await service.handleTranslationCompleted({
      postId: 'post-1',
      textObjectIndex: flatIndexOfMore,
      translations: { en: 'the world' },
    });

    const written = runCommand.mock.calls[0][0].updates[0].u.$set;
    expect((written['translations.en'] as { text: string }).text).toBe('Hello the world');
    expect(JSON.stringify(emit.mock.calls)).not.toContain('@ada');
  });

  it('n’assemble rien pour le content quand la traduction reçue est celle de la puce', async () => {
    const { service, runCommand, emit } = makeService(oldStory({
      textObjects: [{ text: CREDIT, isLocked: true }, { text: 'Bonjour' }, { text: 'le monde' }],
    }));

    await service.handleTranslationCompleted({
      postId: 'post-1',
      textObjectIndex: 0,
      translations: { de: 'Geteilt von @ada' },
    });

    const written = runCommand.mock.calls[0][0].updates[0].u.$set;
    expect(written).not.toHaveProperty(['translations.de']);
    expect(JSON.stringify(emit.mock.calls)).not.toContain('@ada');
  });
});
