/**
 * #18556 — pendant la grâce qui suit l'échéance d'un lecteur, la bulle reste
 * servie pour qu'un second appareil apprenne que le message a brûlé ; son
 * CONTENU, lui, ne l'est plus. Rien de lisible ne reste après la destruction.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { EPHEMERAL_UNAVAILABILITY_GRACE_MS } from '@meeshy/shared/utils/ephemeral-countdown';
import {
  ephemeralDeadlineForReader,
  isLapsedForReader,
  projectEphemeralTombstone,
  withholdRawContent,
} from '../ephemeralTombstone';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const PAST = new Date('2026-11-14T11:50:00.000Z');
const FUTURE = new Date('2026-11-14T12:10:00.000Z');
const RETENTION = new Date('2026-11-21T12:00:00.000Z');
const AFTER_READ = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;

const served = (overrides: Record<string, unknown> = {}) => ({
  id: 'm-1',
  content: 'le secret',
  translations: [{ targetLanguage: 'en', translatedContent: 'the secret' }],
  attachments: [{ id: 'a-1', fileUrl: 'https://x/a.jpg' }],
  encryptedContent: 'cipher',
  encryptionMetadata: { iv: 'x' },
  metadata: { location: { latitude: 1, longitude: 2 } },
  replyTo: { id: 'm-0', content: 'cité' },
  expiresAt: null as Date | null,
  ...overrides,
});

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'm-1',
  senderId: 'p-sender',
  ephemeralDuration: null as number | null,
  effectFlags: AFTER_READ as number | null,
  expiresAt: RETENTION as Date | null,
  createdAt: new Date('2026-11-14T10:00:00.000Z'),
  ...overrides,
});

const reader = (readerDeadline: Date | null) => ({ isSender: false, readerDeadline, latestRecipientDeadline: null });
const sender = (latestRecipientDeadline: Date | null) => ({ isSender: true, readerDeadline: null, latestRecipientDeadline });

describe('projectEphemeralTombstone (#18556)', () => {
  it('un lecteur dont l’échéance est passée ne reçoit plus que la bulle, datée', () => {
    const out = projectEphemeralTombstone(served(), row(), reader(PAST), NOW);

    expect(out).toMatchObject({
      id: 'm-1',
      content: '',
      translations: [],
      attachments: [],
      encryptedContent: null,
      encryptionMetadata: null,
      metadata: null,
      replyTo: null,
      expiresAt: PAST,
    });
  });

  it('un lecteur dont l’échéance est à venir reçoit le message entier', () => {
    const message = served();
    expect(projectEphemeralTombstone(message, row(), reader(FUTURE), NOW)).toBe(message);
  });

  it('un lecteur sans échéance démarrée reçoit le message entier', () => {
    const message = served();
    expect(projectEphemeralTombstone(message, row(), reader(null), NOW)).toBe(message);
  });

  it('l’expéditeur d’une flamme-œil la garde tant qu’un destinataire ne l’a pas consommée', () => {
    const message = served();
    expect(projectEphemeralTombstone(message, row(), sender(PAST), NOW)).toBe(message);
  });

  it('ATTAQUE A1 — l’expéditeur à qui le feu a été ANNONCÉ ne reçoit plus que la bulle : il ne relit pas ce qu’il a vu brûler', () => {
    const destruction = new Date(PAST.getTime() + EPHEMERAL_UNAVAILABILITY_GRACE_MS);
    const announced = { isSender: true, readerDeadline: PAST, latestRecipientDeadline: PAST };

    const out = projectEphemeralTombstone(served(), row({ expiresAt: destruction }), announced, NOW);

    expect(out).toMatchObject({ content: '', translations: [], attachments: [], replyTo: null, expiresAt: PAST });
  });

  it('ATTAQUE A2 — la pierre tombale retire AUSSI ce qui redit le contenu : transfert, story citée, mentions, réactions', () => {
    const out = projectEphemeralTombstone(
      served({
        forwardedFrom: { id: 'src', content: 'le secret', attachments: [{ fileUrl: 'https://x/a.jpg' }] },
        forwardedFromConversation: { id: 'c-src', title: 'Groupe source' },
        postReplyTo: { id: 'post-1', content: 'la story citée' },
        validatedMentions: ['alice'],
        reactionSummary: { '🔥': 2 },
        reactionCount: 2,
        currentUserReactions: ['🔥'],
        location: { latitude: 1, longitude: 2 },
        sticker: { id: 's-1' },
      }),
      row({ ephemeralDuration: 30 }),
      reader(PAST),
      NOW,
    );

    expect(out).toMatchObject({
      content: '',
      forwardedFrom: null,
      forwardedFromConversation: null,
      postReplyTo: null,
      validatedMentions: [],
      reactionSummary: null,
      reactionCount: 0,
      currentUserReactions: [],
      location: null,
      sticker: null,
    });
    expect(JSON.stringify(out)).not.toContain('secret');
    expect(JSON.stringify(out)).not.toContain('https://x/a.jpg');
  });

  it('une réponse dont le message CITÉ est mort pour ce lecteur ne sert plus que sa bulle, datée de cette mort', () => {
    const plain = row({ effectFlags: null, expiresAt: null });

    const out = projectEphemeralTombstone(served(), plain, undefined, NOW, PAST);

    expect(out).toMatchObject({ content: '', replyTo: null, expiresAt: PAST });
    expect(projectEphemeralTombstone(served(), plain, undefined, NOW, FUTURE)).toMatchObject({ content: 'le secret' });
  });

  it('un feu RETENU (accusés coupés) ne grave rien : l’expéditeur ne reçoit pas l’heure du dernier départ', () => {
    const destruction = new Date(PAST.getTime() + EPHEMERAL_UNAVAILABILITY_GRACE_MS);
    const message = served();

    expect(projectEphemeralTombstone(message, row({ expiresAt: destruction }), sender(PAST), NOW)).toBe(message);
    expect(ephemeralDeadlineForReader(row({ expiresAt: destruction }), sender(PAST))).toBeNull();
  });

  it('l’expéditeur d’un éphémère à durée le voit brûler à la plus tardive des échéances', () => {
    const out = projectEphemeralTombstone(
      served(),
      row({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 30 }),
      sender(PAST),
      NOW,
    );

    expect(out).toMatchObject({ content: '', expiresAt: PAST });
  });

  it('ne touche pas un message sans échéance par lecteur', () => {
    const message = served();
    expect(
      projectEphemeralTombstone(message, row({ effectFlags: null, expiresAt: null }), reader(PAST), NOW),
    ).toBe(message);
  });

  it('n’ajoute pas les clés qu’une lecture projetée n’a pas demandées', () => {
    const out = projectEphemeralTombstone({ id: 'm-1', content: 'le secret' }, row(), reader(PAST), NOW);

    expect(out).toEqual({ id: 'm-1', content: '', expiresAt: PAST });
  });
});

describe('withholdRawContent — la pierre tombale d’une ligne BRUTE (#18556)', () => {
  const raw = {
    id: 'm-1',
    conversationId: 'c-1',
    senderId: 'p-sender',
    content: 'le secret',
    translations: { en: { text: 'the secret' } },
    attachments: [{ id: 'a-1', fileUrl: 'https://x/a.jpg' }],
    encryptedContent: 'cipher',
    encryptionMetadata: { iv: 'x' },
    metadata: { location: { latitude: 1, longitude: 2 } },
    replyTo: { id: 'm-0', content: 'cité' },
    replyToId: 'm-0',
    validatedMentions: ['alice'],
    reactionSummary: { '🔥': 2 },
    reactionCount: 2,
    forwardedFromId: 'src',
    forwardedFromConversationId: 'c-src',
    storyReplyToId: 'post-1',
    createdAt: new Date('2026-11-14T10:00:00.000Z'),
  };

  it('ne garde que la bulle : identité, auteur, heure, fil de citation', () => {
    expect(withholdRawContent(raw)).toEqual({
      id: 'm-1',
      conversationId: 'c-1',
      senderId: 'p-sender',
      content: '',
      translations: null,
      attachments: [],
      encryptedContent: null,
      encryptionMetadata: null,
      metadata: null,
      replyTo: null,
      replyToId: 'm-0',
      validatedMentions: [],
      reactionSummary: null,
      reactionCount: 0,
      forwardedFromId: null,
      forwardedFromConversationId: null,
      storyReplyToId: null,
      createdAt: raw.createdAt,
    });
  });

  it('n’ajoute pas les colonnes qu’un select n’a pas demandées', () => {
    expect(withholdRawContent({ id: 'm-1', content: 'le secret' })).toEqual({ id: 'm-1', content: '' });
  });
});

describe('isLapsedForReader (#18556)', () => {
  it('vrai dès l’échéance du lecteur, ou dès la mort de ce qu’il cite', () => {
    expect(isLapsedForReader(row(), reader(PAST), null, NOW)).toBe(true);
    expect(isLapsedForReader(row(), reader(NOW), null, NOW)).toBe(true);
    expect(isLapsedForReader(row({ effectFlags: null, expiresAt: null }), undefined, PAST, NOW)).toBe(true);
  });

  it('faux tant que rien n’est échu pour lui', () => {
    expect(isLapsedForReader(row(), reader(FUTURE), null, NOW)).toBe(false);
    expect(isLapsedForReader(row(), reader(null), FUTURE, NOW)).toBe(false);
    expect(isLapsedForReader(row({ effectFlags: null, expiresAt: PAST }), undefined, null, NOW)).toBe(false);
  });
});
