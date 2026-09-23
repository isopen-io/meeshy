import { describe, it, expect } from '@jest/globals';
import { resolveLastMessagePreviewGroup } from '../lastMessagePreviewGroup';

const NOW = new Date('2026-09-23T12:00:00Z');

const reader = {
  id: 'p-reader',
  userId: 'u-reader',
  user: { systemLanguage: 'fr', regionalLanguage: 'en', customDestinationLanguage: null, deviceLocale: null },
};

const photo = (id: string, fileSize: number | null) => ({
  id,
  mimeType: 'image/jpeg',
  thumbnailUrl: `https://cdn/${id}-thumb.jpg`,
  originalName: `${id}.jpg`,
  fileSize,
  duration: null,
  width: 450,
  height: 456,
  pageCount: null,
});

const makeMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg-1',
  content: 'Le code du portail est 4521',
  originalLanguage: 'fr',
  translations: { en: { text: 'The gate code is 4521' } },
  messageType: 'text',
  messageSource: 'user',
  effectFlags: 0,
  isBlurred: false,
  isViewOnce: false,
  isEncrypted: false,
  expiresAt: null,
  ephemeralDuration: null,
  forwardedFromId: null,
  metadata: null,
  sender: { displayName: 'Alice', user: null },
  attachments: [],
  _count: { attachments: 0 },
  ...overrides,
});

const WITHHELD_CASES: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['vue unique', { isViewOnce: true }],
  ['flouté', { isBlurred: true }],
  ['chiffré', { isEncrypted: true }],
  ['expiré', { expiresAt: new Date('2026-09-23T11:00:00Z') }],
];

describe('resolveLastMessagePreviewGroup — un message protégé ne transporte rien de son contenu', () => {
  it.each(WITHHELD_CASES)('%s : ni texte, ni traduction, ni pièce jointe, ni lieu', (_label, flags) => {
    const group = resolveLastMessagePreviewGroup(
      reader,
      makeMessage({
        ...flags,
        attachments: [photo('a1', 1000), photo('a2', 2000)],
        _count: { attachments: 2 },
        metadata: { location: { latitude: 48.85, longitude: 2.35, name: 'Maison' } },
      }),
      NOW,
    );

    expect(group.lastMessagePreview).toBe('');
    expect(group.lastMessageTranslations).toBeNull();
    expect(group.lastMessageOriginalLanguage).toBeNull();
    expect(group.lastMessageAttachments).toEqual([]);
    expect(group.lastMessageAttachmentCount).toBe(0);
    expect(group.lastMessageAttachmentSummary).toBeNull();
    expect('location' in group).toBe(false);
    expect(JSON.stringify(group)).not.toContain('4521');
    expect(JSON.stringify(group)).not.toContain('cdn/');
  });

  it('vue unique : garde les drapeaux qui qualifient le placeholder', () => {
    const group = resolveLastMessagePreviewGroup(reader, makeMessage({ isViewOnce: true, effectFlags: 4 }), NOW);

    expect(group.lastMessageIsViewOnce).toBe(true);
    expect(group.lastMessageType).toBe('text');
    expect(group.lastMessageEffectFlags).toBe(4);
    expect(group.lastMessageSenderName).toBe('Alice');
  });

  it('éphémère actif (ephemeralDuration posée) : le texte reste servi, même quand la colonne interne est passée', () => {
    const group = resolveLastMessagePreviewGroup(
      reader,
      makeMessage({ ephemeralDuration: 240, expiresAt: new Date('2026-09-23T11:59:00Z') }),
      NOW,
    );

    expect(group.lastMessagePreview).toBe('Le code du portail est 4521');
    expect(group.lastMessageEphemeralDuration).toBe(240);
  });

  it("éphémère : l'échéance ne voyage pas en room — la colonne est l'heure interne de destruction (#7451)", () => {
    const group = resolveLastMessagePreviewGroup(
      reader,
      makeMessage({ ephemeralDuration: 240, expiresAt: new Date('2026-09-30T12:00:00Z') }),
      NOW,
    );
    expect(group.lastMessageExpiresAt).toBeNull();
  });

  it('vue unique non éphémère : sa grâce voyage', () => {
    const group = resolveLastMessagePreviewGroup(
      reader,
      makeMessage({ expiresAt: new Date('2026-09-23T13:00:00Z') }),
      NOW,
    );
    expect(group.lastMessageExpiresAt).toBe('2026-09-23T13:00:00.000Z');
  });
});

describe('resolveLastMessagePreviewGroup — la nature du dernier message', () => {
  it('résume toutes les pièces jointes, pas seulement la première', () => {
    const group = resolveLastMessagePreviewGroup(
      reader,
      makeMessage({
        content: '',
        attachments: [photo('a1', 1000), photo('a2', null), photo('a3', 3000)],
        _count: { attachments: 3 },
      }),
      NOW,
    );

    expect(group.lastMessageAttachmentSummary).toEqual({ count: 3, kinds: { image: 3 }, totalSize: 4000 });
    expect(group.lastMessageAttachments).toHaveLength(1);
    expect(group.lastMessageAttachments[0]).toMatchObject({ fileSize: 1000, width: 450, height: 456, pageCount: null });
  });

  it('mixte : chaque famille compte, totalSize null si aucune taille connue', () => {
    const group = resolveLastMessagePreviewGroup(
      reader,
      makeMessage({
        attachments: [
          { ...photo('a1', null) },
          { ...photo('a2', null), mimeType: 'video/mp4' },
          { ...photo('a3', null), mimeType: 'audio/mpeg' },
          { ...photo('a4', null), mimeType: 'application/pdf', pageCount: 12 },
        ],
        _count: { attachments: 4 },
      }),
      NOW,
    );

    expect(group.lastMessageAttachmentSummary).toEqual({
      count: 4,
      kinds: { image: 1, video: 1, audio: 1, file: 1 },
      totalSize: null,
    });
  });

  it('sans pièce jointe : attachmentSummary null', () => {
    const group = resolveLastMessagePreviewGroup(reader, makeMessage(), NOW);
    expect(group.lastMessageAttachmentSummary).toBeNull();
  });

  it('transféré, chiffré ou non : isForwarded suit forwardedFromId', () => {
    expect(resolveLastMessagePreviewGroup(reader, makeMessage({ forwardedFromId: 'm0' }), NOW).lastMessageIsForwarded).toBe(true);
    expect(resolveLastMessagePreviewGroup(reader, makeMessage(), NOW).lastMessageIsForwarded).toBe(false);
  });

  it("un appel terminé se lit depuis la métadonnée, jamais depuis le texte FR", () => {
    const group = resolveLastMessagePreviewGroup(
      reader,
      makeMessage({
        messageType: 'system',
        messageSource: 'system',
        content: 'Appel vidéo · 04:12',
        metadata: {
          kind: 'call',
          callId: 'call-1',
          initiatorId: 'u-alice',
          callType: 'video',
          outcome: 'completed',
          durationSeconds: 252,
          bytesTotal: null,
          bytesEstimated: false,
          networkQuality: null,
        },
      }),
      NOW,
    );

    expect(group.lastMessageCallSummary).toEqual({
      callId: 'call-1',
      kind: 'video',
      outcome: 'completed',
      durationSec: 252,
      initiatorId: 'u-alice',
      endedByInitiator: false,
    });
    expect(group.lastMessageSystemEvent).toBeNull();
  });

  it("un appel encore en cours rend l'issue ongoing", () => {
    const group = resolveLastMessagePreviewGroup(
      reader,
      makeMessage({
        messageType: 'system',
        messageSource: 'system',
        metadata: { kind: 'call-live', callId: 'c2', initiatorId: 'u-a', callType: 'audio', outcome: 'completed', durationSeconds: 0 },
      }),
      NOW,
    );
    expect(group.lastMessageCallSummary).toMatchObject({ outcome: 'ongoing', kind: 'audio' });
  });

  it("un avis d'arrivée devient une clé localisable, sans le texte FR", () => {
    const group = resolveLastMessagePreviewGroup(
      reader,
      makeMessage({
        messageType: 'system',
        messageSource: 'system',
        content: 'Bob a rejoint la conversation',
        metadata: { kind: 'member-joined', participantId: 'p-bob', displayName: 'Bob', isAnonymous: false, viaShareLink: false },
      }),
      NOW,
    );
    expect(group.lastMessageSystemEvent).toEqual({ key: 'system.member-joined', params: { name: 'Bob' } });
    expect(group.lastMessageCallSummary).toBeNull();
  });

  it("l'activation du chiffrement devient une clé localisable", () => {
    const group = resolveLastMessagePreviewGroup(
      reader,
      makeMessage({ messageType: 'system', metadata: { kind: 'encryption-enabled', mode: 'e2ee' } }),
      NOW,
    );
    expect(group.lastMessageSystemEvent).toEqual({ key: 'system.encryption-enabled', params: { mode: 'e2ee' } });
  });

  it('un message système que le serveur ne sait pas typer rend system.generic', () => {
    const group = resolveLastMessagePreviewGroup(reader, makeMessage({ messageType: 'system', metadata: null }), NOW);
    expect(group.lastMessageSystemEvent).toEqual({ key: 'system.generic', params: {} });
  });

  it('un message ordinaire ne porte ni événement système ni appel', () => {
    const group = resolveLastMessagePreviewGroup(reader, makeMessage(), NOW);
    expect(group.lastMessageSystemEvent).toBeNull();
    expect(group.lastMessageCallSummary).toBeNull();
  });

  it('Prisme au rang 2 : la carte sert la langue secondaire quand la primaire manque', () => {
    const group = resolveLastMessagePreviewGroup(
      reader,
      makeMessage({ originalLanguage: 'es', content: 'Hola', translations: { en: { text: 'Hello' } } }),
      NOW,
    );
    expect(group.lastMessageTranslations).toEqual({ en: 'Hello' });
    expect(group.lastMessagePreview).toBe('Hola');
  });

  it('hisse le lieu d’un message non protégé', () => {
    const group = resolveLastMessagePreviewGroup(
      reader,
      makeMessage({ content: '', metadata: { location: { latitude: 48.85, longitude: 2.35, name: 'Maison' } } }),
      NOW,
    );
    expect(group.location).toMatchObject({ latitude: 48.85, longitude: 2.35 });
  });
});
