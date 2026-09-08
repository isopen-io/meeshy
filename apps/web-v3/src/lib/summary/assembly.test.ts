import { describe, expect, test } from 'bun:test';

import type { Message, Participant } from '@/lib/api/types';

import { buildLivingSummary, resolveSkeleton, type LivingSummaryViewer } from './assembly';

/**
 * `buildLivingSummary` — miroir des 9 cas de `LivingSummaryViewModelTests.swift`
 * + `FaceRampViewModelTests.swift`, transposés au modèle de vue PUR
 * `LivingSummaryModel` (#5695, étape 7), plus 3 cas de conversion.
 */

const NOW = Date.UTC(2026, 0, 10, 9, 0, 0);
const MIN = 60_000;

const VIEWER: LivingSummaryViewer = { id: 'u-viewer', handle: 'vous', displayName: 'Vous' };

const participant = (partial: Partial<Participant>): Participant =>
  ({
    id: `p-${partial.userId ?? 'x'}`,
    conversationId: 'c1',
    type: 'user',
    role: 'member',
    language: 'fr',
    displayName: 'Quelqu’un',
    permissions: {
      canSendMessages: true,
      canSendFiles: true,
      canSendImages: true,
      canSendVideos: true,
      canSendAudios: true,
      canSendLocations: true,
      canSendLinks: true,
    },
    isActive: true,
    isOnline: false,
    joinedAt: new Date(NOW - 30 * 86_400_000),
    ...partial,
  }) as Participant;

const message = (
  partial: Omit<Partial<Message>, 'createdAt' | 'timestamp'> & {
    readonly id: string;
    readonly senderId: string;
    readonly createdAt: number;
  },
): Message =>
  ({
    conversationId: 'c1',
    content: '',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    ...partial,
    createdAt: new Date(partial.createdAt),
    timestamp: new Date(partial.createdAt),
  }) as Message;

const baseInput = (overrides: Partial<Parameters<typeof buildLivingSummary>[0]> = {}) => ({
  messages: [] as readonly Message[],
  viewer: VIEWER,
  participants: [] as readonly Participant[],
  windowCoversUnread: true,
  now: NOW,
  locale: 'fr',
  ...overrides,
});

describe('buildLivingSummary — les neuf cas', () => {
  test('exposesDigestAndFaceRampSynchronously_noAsyncWait', () => {
    const model = buildLivingSummary(baseInput({ messages: [message({ id: 'm1', senderId: 'u1', createdAt: NOW })] }));
    expect(model.digest).toBeDefined();
    expect(model.faceRamp).toBeDefined();
  });

  test('showsSkeleton_trueWhenEverythingEmpty', () => {
    expect(resolveSkeleton({ digest: { messageCount: 0 }, faceRamp: [], agentSummary: null })).toBe(true);
  });

  test('showsSkeleton_falseWhenDigestHasMessages', () => {
    expect(resolveSkeleton({ digest: { messageCount: 1 }, faceRamp: [], agentSummary: null })).toBe(false);
  });

  test('showsSkeleton_falseWhenFaceRampNonEmptyEvenIfDigestEmpty', () => {
    expect(resolveSkeleton({ digest: { messageCount: 0 }, faceRamp: [{}], agentSummary: null })).toBe(false);
  });

  test('showsSkeleton_falseWhenAgentSummaryPresent', () => {
    expect(resolveSkeleton({ digest: { messageCount: 0 }, faceRamp: [], agentSummary: { text: 'x' } })).toBe(false);
  });

  test('faceRamp_preservesTheOrderProvidedByRanking (Karim, Adam)', () => {
    const model = buildLivingSummary(
      baseInput({
        participants: [
          participant({ userId: 'u-karim', displayName: 'Karim' }),
          participant({ userId: 'u-adam', displayName: 'Adam' }),
        ],
        messages: [
          message({ id: 'm1', senderId: 'u-karim', createdAt: NOW, content: 'Une question ?' }),
          message({ id: 'm2', senderId: 'u-karim', createdAt: NOW + MIN, content: 'Une autre ?' }),
          message({ id: 'm3', senderId: 'u-karim', createdAt: NOW + 2 * MIN, content: 'Encore une ?' }),
          message({ id: 'm4', senderId: 'u-adam', createdAt: NOW + 3 * MIN, content: 'Salut' }),
        ],
      }),
    );
    expect(model.faceRamp.map((e) => e.displayName)).toEqual(['Karim']);
  });

  test('entry_evidenceMessageIds_areExactlyTheMessagesConcerningThisPerson', () => {
    const model = buildLivingSummary(
      baseInput({
        participants: [participant({ userId: 'u-amina', displayName: 'Amina' })],
        messages: [
          message({ id: 'm1', senderId: 'u-viewer', createdAt: NOW }),
          message({ id: 'm2', senderId: 'u-amina', createdAt: NOW + MIN, replyToId: 'm1' }),
        ],
      }),
    );
    expect(model.faceRamp[0]?.evidenceMessageIds).toEqual(['m2']);
  });

  test('emptyFaceRamp_staysEmpty_neverFabricatesAnEntry', () => {
    const model = buildLivingSummary(
      baseInput({ messages: [message({ id: 'm1', senderId: 'u1', createdAt: NOW, content: 'Bonjour' })] }),
    );
    expect(model.faceRamp).toEqual([]);
  });

  test('mentionsViewer_usesSharedMentionParser_withUnicodeBoundaries', () => {
    const marie: LivingSummaryViewer = { id: 'u-marie', handle: 'marie', displayName: 'Marie' };
    const model = buildLivingSummary(
      baseInput({
        viewer: marie,
        participants: [participant({ userId: 'u-other', displayName: 'Autre' })],
        messages: [
          message({ id: 'm1', senderId: 'u-other', createdAt: NOW, content: '@marie-claire, salut.' }),
          message({ id: 'm2', senderId: 'u-other', createdAt: NOW + MIN, content: 'contact@marie.com, ignore-moi.' }),
          message({ id: 'm3', senderId: 'u-other', createdAt: NOW + 2 * MIN, content: 'Coucou @Marie, tu es là.' }),
        ],
      }),
    );
    // `@marie` dans `@marie-claire` NE mentionne PAS `marie` (frontière
    // droite) ; `contact@marie.com` non plus (frontière gauche, adresse
    // e-mail) ; `@Marie` (casse du displayName) OUI — la preuve que
    // l'écart 1 (§1.4) tourne sur le parseur PARTAGÉ, pas une sous-chaîne.
    const mentions = model.digest.awaitingYou.filter((item) => item.kind === 'mention');
    expect(mentions).toHaveLength(1);
    expect(mentions[0]?.evidenceMessageIds).toEqual(['m3']);
  });
});

describe('buildLivingSummary — les trois cas de conversion', () => {
  test('attachmentKinds_deriveFromMimeType_viaSharedGetAttachmentType', () => {
    const attachment = (mimeType: string) =>
      ({
        id: 'a1',
        messageId: 'm1',
        fileName: 'f',
        originalName: 'f',
        mimeType,
        fileSize: 1,
        fileUrl: '',
        uploadedBy: 'u1',
        isAnonymous: false,
        createdAt: new Date(NOW).toISOString(),
        capturedInApp: false,
        isViewOnce: false,
        viewOnceCount: 0,
        isBlurred: false,
        viewedCount: 0,
        downloadedCount: 0,
        consumedCount: 0,
        isForwarded: false,
      }) as Message['attachments'] extends readonly (infer A)[] ? A : never;

    const model = buildLivingSummary(
      baseInput({
        messages: [
          message({ id: 'm1', senderId: 'u1', createdAt: NOW, attachments: [attachment('image/png')] }),
          message({ id: 'm2', senderId: 'u1', createdAt: NOW + MIN, attachments: [attachment('application/pdf')] }),
          message({ id: 'm3', senderId: 'u1', createdAt: NOW + 2 * MIN, attachments: [attachment('audio/mp4')] }),
          message({ id: 'm4', senderId: 'u1', createdAt: NOW + 3 * MIN, attachments: [attachment('video/mp4')] }),
        ],
      }),
    );
    expect(model.digest.media).toEqual({ images: 1, videos: 1, audios: 1, files: 1, locations: 0, links: 0 });
  });

  test('linkCount_countsHttpUrlsInContent', () => {
    const model = buildLivingSummary(
      baseInput({
        messages: [
          message({ id: 'm1', senderId: 'u1', createdAt: NOW, content: 'Voir https://meeshy.me et http://example.com/x' }),
        ],
      }),
    );
    expect(model.digest.media.links).toBe(2);
  });

  test('roster_isDerivedFromMessages_firstSeenOrder_withPresenceFromParticipantWhenKnown', () => {
    const model = buildLivingSummary(
      baseInput({
        participants: [participant({ userId: 'u-amina', displayName: 'Amina', isOnline: true })],
        messages: [
          message({ id: 'm1', senderId: 'u-amina', createdAt: NOW, content: '@vous, ça va ?' }),
          message({ id: 'm2', senderId: 'u-ghost', createdAt: NOW + MIN, content: 'inconnu' }),
        ],
      }),
    );
    // `u-amina` est connue (présence en ligne), `u-ghost` n'a pas de
    // roster : repli honnête sur son id comme nom.
    const [amina] = model.faceRamp;
    expect(amina?.id).toBe('u-amina');
    expect(amina?.presence).toBe('online');
  });
});
