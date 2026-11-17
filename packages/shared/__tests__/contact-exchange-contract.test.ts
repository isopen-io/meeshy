import { describe, expect, it } from 'vitest';
import {
  CONTACT_EXCHANGE_ERROR_CODES,
  CONTACT_EXCHANGE_LOCKED,
  CONTACT_EXCHANGE_OFFERS,
  CONTACT_EXCHANGE_TOKEN_PATTERN,
  CONTACT_EXCHANGE_TTL_SECONDS,
  contactExchangeIssuePayloadSchema,
} from '../types/contact-exchange';
import { SERVER_EVENTS } from '../types/socketio-events';

describe('le partage sans contact (#19205)', () => {
  it('chacun donne sa vitrine, une demande d\'ami, ou les deux — jamais rien, jamais son numéro', () => {
    expect(CONTACT_EXCHANGE_OFFERS).toEqual(['vitrine', 'friendRequest']);
    expect(contactExchangeIssuePayloadSchema.parse({ offers: ['vitrine'] }).offers).toEqual(['vitrine']);
    expect(contactExchangeIssuePayloadSchema.parse({ offers: ['friendRequest', 'vitrine', 'vitrine'] }).offers).toEqual(['vitrine', 'friendRequest']);
    for (const offers of [[], ['phone'], ['email'], 'vitrine', null]) {
      expect(contactExchangeIssuePayloadSchema.safeParse({ offers }).success).toBe(false);
    }
    expect(contactExchangeIssuePayloadSchema.safeParse({}).success).toBe(false);
  });

  it('le numéro est un verrou annoncé, jamais une offre', () => {
    expect(CONTACT_EXCHANGE_LOCKED).toEqual(['phone']);
    expect(CONTACT_EXCHANGE_OFFERS).not.toContain('phone');
  });

  it('le jeton vit deux minutes et tient dans un QR ou une charge NFC', () => {
    expect(CONTACT_EXCHANGE_TTL_SECONDS).toBe(120);
    expect(CONTACT_EXCHANGE_TOKEN_PATTERN.test('ce1.' + 'A'.repeat(22) + '.3.1790000000.' + 'b'.repeat(22))).toBe(true);
    expect(CONTACT_EXCHANGE_TOKEN_PATTERN.test('ce1.../etc')).toBe(false);
  });

  it('un seul refus générique, un événement d\'accusé à l\'émetteur', () => {
    expect(CONTACT_EXCHANGE_ERROR_CODES.UNAVAILABLE).toBe('CONTACT_EXCHANGE_UNAVAILABLE');
    expect(CONTACT_EXCHANGE_ERROR_CODES.INVALID).toBe('CONTACT_EXCHANGE_INVALID');
    expect(SERVER_EVENTS.CONTACT_EXCHANGE_RECEIVED).toBe('contact-exchange:received');
  });
});
