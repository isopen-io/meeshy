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
import { ephemeralDeadlineForReader, projectEphemeralTombstone } from '../ephemeralTombstone';

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

  it('l’expéditeur d’une flamme-œil consommée par tous ne reçoit jamais l’heure du dernier départ', () => {
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
