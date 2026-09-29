/**
 * #8562 — la citation d'un éphémère ÉCHU POUR CE LECTEUR est servie scellée
 * par la passerelle, jamais seulement par le client.
 *
 * Un éphémère a une échéance PAR LECTEUR (`D(u)` = `MessageStatusEntry.ephemeralExpiresAt`),
 * et `Message.expiresAt` est l'heure INTERNE de destruction (`max D(u) + 1 h`,
 * ou le plafond de rétention). La citation répandait la ligne citée et ne
 * masquait que vue unique / flou / chiffré : une flamme-œil consommée par B
 * restait lisible dans la citation d'une réponse jusqu'à la destruction
 * globale, et la citation transportait l'heure brute.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import fastJson from 'fast-json-stringify';
import { messageSchema } from '@meeshy/shared/types/api-schemas';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import {
  servedQuotedMessage,
  sealedQuotedMessage,
  withSealedQuote,
} from '../../services/messaging/servedQuotedMessage';

const NOW = new Date('2026-09-29T12:00:00.000Z');
const BEFORE = new Date('2026-09-29T11:59:00.000Z');
const AFTER = new Date('2026-09-29T12:01:00.000Z');
const RAW_DESTRUCTION = new Date('2026-10-06T12:00:00.000Z');

const flammeOeil = (overrides: Record<string, unknown> = {}) => ({
  id: '507f1f77bcf86cd799439014',
  senderId: '507f1f77bcf86cd799439001',
  content: 'le code du coffre est 4271',
  messageType: 'audio',
  effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ,
  ephemeralDuration: null,
  expiresAt: RAW_DESTRUCTION,
  deletedAt: null,
  translations: { en: { text: 'the vault code is 4271', translationModel: 'basic' as const, createdAt: new Date() } },
  attachments: [
    {
      id: 'a1',
      mimeType: 'audio/m4a',
      fileUrl: 'https://cdn/vocal.m4a',
      transcription: { text: 'le code du coffre est 4271' },
    },
  ],
  metadata: { location: { latitude: 48.85, longitude: 2.35, name: 'Chez moi' } },
  validatedMentions: ['507f1f77bcf86cd799439099'],
  ...overrides,
});

const minuteur = (overrides: Record<string, unknown> = {}) =>
  flammeOeil({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 30, ...overrides });

const lecteur = (readerDeadline: Date | null, overrides: Record<string, unknown> = {}) => ({
  resolution: { isSender: false, readerDeadline, latestRecipientDeadline: readerDeadline, ...overrides },
  now: NOW,
});

const serialize = fastJson({
  type: 'object',
  properties: { data: messageSchema as Record<string, unknown> },
} as never);

describe('la citation d’une flamme-œil CONSOMMÉE par ce lecteur est scellée', () => {
  const served = servedQuotedMessage(flammeOeil(), {
    includeTranslations: true,
    attachmentReplyTo: { attachmentId: 'a1', kind: 'audio' },
    ephemeralReader: lecteur(BEFORE),
  });

  it('ne transporte ni texte, ni traductions, ni pièces (donc ni transcription ni fichier)', () => {
    expect(served['content']).toBe('');
    expect(served['translations']).toBeUndefined();
    expect(served['attachments']).toEqual([]);
    expect(JSON.stringify({ ...flammeOeil(), ...served })).not.toContain('https://cdn/vocal.m4a');
  });

  it('écrase ce qui voyage À CÔTÉ : métadonnées, position, sticker, mentions, ancre de pièce', () => {
    expect('metadata' in served && served['metadata'] === undefined).toBe(true);
    expect('location' in served && served['location'] === undefined).toBe(true);
    expect('sticker' in served && served['sticker'] === undefined).toBe(true);
    expect(served['validatedMentions']).toEqual([]);
    expect(served['attachmentReplyTo']).toBeUndefined();
  });

  it('DIT qu’elle est scellée, à l’échéance DU LECTEUR — jamais l’heure interne de destruction', () => {
    expect(served['deletedAt']).toEqual(BEFORE);
    expect(served['expiresAt']).toEqual(BEFORE);
  });

  it('passe le schéma de réponse sans rien laisser fuir', () => {
    const out = JSON.parse(
      serialize({ data: { id: '507f1f77bcf86cd799439011', content: 'ma réponse', replyTo: { ...flammeOeil(), ...served } } } as never),
    ).data.replyTo;
    expect(out.deletedAt).toBe(BEFORE.toISOString());
    expect(out.content).toBe('');
    expect(JSON.stringify(out)).not.toContain('4271');
    expect(JSON.stringify(out)).not.toContain(RAW_DESTRUCTION.toISOString());
  });
});

describe('un éphémère à durée échu pour ce lecteur est scellé ; vivant, il sert SON échéance', () => {
  it('échéance passée ⇒ scellée', () => {
    const served = servedQuotedMessage(minuteur(), { ephemeralReader: lecteur(BEFORE) });
    expect(served['deletedAt']).toEqual(BEFORE);
    expect(served['content']).toBe('');
  });

  it('échéance à venir ⇒ lisible, et l’échéance servie est D(lecteur)', () => {
    const served = servedQuotedMessage(minuteur(), { ephemeralReader: lecteur(AFTER) });
    expect(served['deletedAt']).toBeUndefined();
    expect(served['content']).toBeUndefined();
    expect(served['expiresAt']).toEqual(AFTER);
  });

  it('décompte non démarré ⇒ lisible, sans échéance servie (jamais la colonne brute)', () => {
    const served = servedQuotedMessage(minuteur(), { ephemeralReader: lecteur(null) });
    expect(served['deletedAt']).toBeUndefined();
    expect('expiresAt' in served && served['expiresAt'] === undefined).toBe(true);
  });

  it('lecteur inconnu (diffusion de room) ⇒ jamais l’heure brute', () => {
    const served = servedQuotedMessage(minuteur());
    expect('expiresAt' in served && served['expiresAt'] === undefined).toBe(true);
    expect(served['deletedAt']).toBeUndefined();
  });
});

describe('l’expéditeur du message cité garde sa règle', () => {
  it('sa flamme-œil consommée par d’autres reste lisible pour lui, sans échéance', () => {
    const served = servedQuotedMessage(flammeOeil(), {
      ephemeralReader: lecteur(null, { isSender: true, latestRecipientDeadline: BEFORE }),
    });
    expect(served['deletedAt']).toBeUndefined();
    expect('expiresAt' in served && served['expiresAt'] === undefined).toBe(true);
  });

  it('son minuteur échu chez tous reste lisible pour lui, avec la plus tardive des échéances', () => {
    const served = servedQuotedMessage(minuteur(), {
      ephemeralReader: lecteur(null, { isSender: true, latestRecipientDeadline: BEFORE }),
    });
    expect(served['deletedAt']).toBeUndefined();
    expect(served['expiresAt']).toEqual(BEFORE);
  });
});

describe('un message NON éphémère n’est pas touché', () => {
  it('la colonne `expiresAt` (grâce de vue unique) n’est pas réécrite', () => {
    const served = servedQuotedMessage(flammeOeil({ effectFlags: 0, ephemeralDuration: null }), {
      ephemeralReader: lecteur(BEFORE),
    });
    expect('expiresAt' in served).toBe(false);
    expect(served['deletedAt']).toBeUndefined();
  });

  it('une suppression garde sa propre date', () => {
    const deletedAt = new Date('2026-09-20T00:00:00.000Z');
    const served = servedQuotedMessage(flammeOeil({ deletedAt }), { ephemeralReader: lecteur(BEFORE) });
    expect(served['deletedAt']).toEqual(deletedAt);
  });
});

describe('withSealedQuote — la variante scellée d’une charge de diffusion', () => {
  it('scelle la citation d’une charge sans toucher au reste', () => {
    const payload = { id: 'r1', content: 'ma réponse', replyTo: { ...flammeOeil(), sender: { id: 'p1' } } };
    const sealed = withSealedQuote(payload, BEFORE);
    expect(sealed.content).toBe('ma réponse');
    expect(sealed.replyTo).toMatchObject({ id: flammeOeil().id, content: '', deletedAt: BEFORE, attachments: [] });
    expect((sealed.replyTo as Record<string, unknown>)['sender']).toEqual({ id: 'p1' });
    expect(JSON.stringify(sealed)).not.toContain('4271');
    expect(payload.replyTo.content).toBe('le code du coffre est 4271');
  });

  it('une charge sans citation repart telle quelle', () => {
    const payload = { id: 'r1', content: 'x' };
    expect(withSealedQuote(payload, BEFORE)).toBe(payload);
  });

  it('sealedQuotedMessage est la forme unique du scellé', () => {
    expect(sealedQuotedMessage(BEFORE)).toMatchObject({ content: '', deletedAt: BEFORE, expiresAt: BEFORE });
  });
});
