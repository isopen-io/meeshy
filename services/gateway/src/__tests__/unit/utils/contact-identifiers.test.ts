/**
 * Unit tests for contact identifier normalization (utils/contact-identifiers.ts)
 *
 * Le carnet d'adresses est une donnée appareil NON MAÎTRISÉE : chaînes vides,
 * codes courts (`*123#`), libellés (`SOS`), doublons, entrées malformées. Ces
 * tests figent la tolérance : une entrée atypique est ÉCARTÉE, jamais fatale
 * pour le lot entier.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  resolveDefaultCountry,
  normalizeContacts,
  MAX_CONTACTS_PER_SYNC,
  MAX_IDENTIFIERS_PER_CONTACT,
} from '../../../utils/contact-identifiers';

describe('resolveDefaultCountry', () => {
  it('accepts a valid ISO alpha-2 code', () => {
    expect(resolveDefaultCountry('FR')).toBe('FR');
  });

  it('uppercases a lowercase code', () => {
    expect(resolveDefaultCountry('sn')).toBe('SN');
  });

  it('returns undefined for a numeric UN M49 region identifier', () => {
    // `Locale.current.region?.identifier` peut valoir "419" (Amérique latine).
    // Le batch entier ne doit PAS être rejeté pour autant.
    expect(resolveDefaultCountry('419')).toBeUndefined();
  });

  it('returns undefined for an unknown country code', () => {
    expect(resolveDefaultCountry('XX')).toBeUndefined();
  });

  it('returns undefined for non-string input', () => {
    expect(resolveDefaultCountry(undefined)).toBeUndefined();
    expect(resolveDefaultCountry(42)).toBeUndefined();
    expect(resolveDefaultCountry(null)).toBeUndefined();
  });
});

describe('normalizeContacts — phone numbers', () => {
  it('normalizes a local number using the default country', () => {
    const [contact] = normalizeContacts([{ phoneNumbers: ['77 123 45 67'] }], 'SN');
    expect(contact.phoneNumbers).toEqual(['+221771234567']);
  });

  it('normalizes an international number regardless of default country', () => {
    const [contact] = normalizeContacts([{ phoneNumbers: ['+33 6 12 34 56 78'] }], 'SN');
    expect(contact.phoneNumbers).toEqual(['+33612345678']);
  });

  it('drops address-book junk without throwing', () => {
    const result = normalizeContacts(
      [{ displayName: 'Junk', phoneNumbers: ['*123#', 'SOS', '', '   ', '112'], emails: ['keep@me.com'] }],
      'FR'
    );
    expect(result).toHaveLength(1);
    expect(result[0].phoneNumbers).toEqual([]);
    expect(result[0].emails).toEqual(['keep@me.com']);
  });

  it('drops a number that libphonenumber rejects as an invalid country', () => {
    const result = normalizeContacts([{ phoneNumbers: ['+999 000 111 222'], emails: ['a@b.com'] }], 'FR');
    expect(result[0].phoneNumbers).toEqual([]);
  });

  it('deduplicates the same number written in two formats', () => {
    const [contact] = normalizeContacts(
      [{ phoneNumbers: ['0612345678', '+33 6 12 34 56 78', '06.12.34.56.78'] }],
      'FR'
    );
    expect(contact.phoneNumbers).toEqual(['+33612345678']);
  });

  it('drops numbers that parse but are not valid for their country', () => {
    const [contact] = normalizeContacts([{ phoneNumbers: ['+1 555 123 4567'], emails: ['a@b.com'] }], 'FR');
    expect(contact.phoneNumbers).toEqual([]);
  });
});

describe('normalizeContacts — emails', () => {
  it('trims and lowercases', () => {
    const [contact] = normalizeContacts([{ emails: ['  Awa.Diallo@Test.COM '] }]);
    expect(contact.emails).toEqual(['awa.diallo@test.com']);
  });

  it('drops values that are not email-shaped', () => {
    const result = normalizeContacts([{ emails: ['not-an-email', '@nope', 'x@', '@y.com'], phoneNumbers: ['+33612345678'] }]);
    expect(result[0].emails).toEqual([]);
  });

  it('deduplicates case variants', () => {
    const [contact] = normalizeContacts([{ emails: ['A@B.com', 'a@b.com'] }]);
    expect(contact.emails).toEqual(['a@b.com']);
  });
});

describe('normalizeContacts — usernames (pseudo vCard)', () => {
  it('strips a leading @ and lowercases', () => {
    const [contact] = normalizeContacts([{ usernames: ['@AwaD'] }]);
    expect(contact.usernames).toEqual(['awad']);
  });

  it('drops pseudos outside the platform username charset', () => {
    const result = normalizeContacts([{ usernames: ['a', 'way-too-long-a-pseudo-here', 'has space', 'ok_1'] }]);
    expect(result[0].usernames).toEqual(['ok_1']);
  });
});

describe('normalizeContacts — entry tolerance', () => {
  it('skips an entry that carries no usable identifier', () => {
    const result = normalizeContacts([
      { displayName: 'Nothing useful', phoneNumbers: ['*123#'], emails: ['nope'] },
      { displayName: 'Awa', emails: ['awa@test.com'] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe('Awa');
  });

  it('skips malformed entries instead of failing the whole batch', () => {
    const result = normalizeContacts([
      null,
      'not an object',
      42,
      { phoneNumbers: 'not-an-array', emails: ['ok@test.com'] },
      { emails: [null, 17, 'valid@test.com'] },
    ] as unknown[]);
    expect(result).toHaveLength(2);
    expect(result[0].emails).toEqual(['ok@test.com']);
    expect(result[1].emails).toEqual(['valid@test.com']);
  });

  it('returns an empty list when the payload is not an array', () => {
    expect(normalizeContacts(undefined)).toEqual([]);
    expect(normalizeContacts({} as unknown)).toEqual([]);
  });

  it('truncates an oversized batch instead of rejecting it', () => {
    const contacts = Array.from({ length: MAX_CONTACTS_PER_SYNC + 50 }, (_, i) => ({
      emails: [`user${i}@test.com`],
    }));
    expect(normalizeContacts(contacts)).toHaveLength(MAX_CONTACTS_PER_SYNC);
  });

  it('caps identifiers per contact', () => {
    const emails = Array.from({ length: MAX_IDENTIFIERS_PER_CONTACT + 20 }, (_, i) => `u${i}@test.com`);
    const [contact] = normalizeContacts([{ emails }]);
    expect(contact.emails).toHaveLength(MAX_IDENTIFIERS_PER_CONTACT);
  });

  it('clamps an overlong display name rather than dropping the contact', () => {
    const [contact] = normalizeContacts([{ displayName: 'x'.repeat(500), emails: ['a@b.com'] }]);
    expect(contact.displayName).toHaveLength(200);
  });

  it('normalizes a blank display name to null', () => {
    const [contact] = normalizeContacts([{ displayName: '   ', emails: ['a@b.com'] }]);
    expect(contact.displayName).toBeNull();
  });
});

describe('normalizeContacts — contactKey stability', () => {
  it('is identical across two syncs of the same contact', () => {
    const first = normalizeContacts([{ displayName: 'Awa', emails: ['awa@test.com'] }]);
    const second = normalizeContacts([{ displayName: 'Awa', emails: ['awa@test.com'] }]);
    expect(first[0].contactKey).toBe(second[0].contactKey);
  });

  it('ignores identifier ordering and display name changes', () => {
    const a = normalizeContacts([
      { displayName: 'Awa Diallo', emails: ['a@test.com', 'b@test.com'], phoneNumbers: ['+33612345678'] },
    ]);
    const b = normalizeContacts([
      { displayName: 'Awa (bureau)', phoneNumbers: ['0612345678'], emails: ['b@test.com', 'a@test.com'] },
    ], 'FR');
    expect(a[0].contactKey).toBe(b[0].contactKey);
  });

  it('differs between two distinct contacts', () => {
    const [a, b] = normalizeContacts([{ emails: ['a@test.com'] }, { emails: ['b@test.com'] }]);
    expect(a.contactKey).not.toBe(b.contactKey);
  });

  it('merges duplicate device entries that share the same identifiers', () => {
    const result = normalizeContacts([
      { displayName: 'Awa', emails: ['awa@test.com'] },
      { displayName: 'Awa duplicate', emails: ['awa@test.com'] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe('Awa');
  });
});
