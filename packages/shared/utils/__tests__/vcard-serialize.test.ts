import { describe, it, expect } from 'vitest';
import type { ParsedVCard } from '../../types/contact-card';
import { contactCardFileName, contactCardNameFromFileName, parseVCard, serializeVCard } from '../vcard';

const card = (overrides: Partial<ParsedVCard> = {}): ParsedVCard => ({
  formattedName: 'Awa Diallo',
  givenName: 'Awa',
  familyName: 'Diallo',
  phones: [{ label: 'mobile', value: '+33 6 12 34 56 78' }],
  emails: [{ label: 'home', value: 'awa@example.com' }],
  urls: [],
  addresses: [],
  ...overrides,
});

const lines = (text: string): string[] => text.split('\r\n');

describe('serializeVCard — ce que le web envoie (#8242)', () => {
  it('écrit une vCard 3.0 en CRLF, comme iOS', () => {
    const text = serializeVCard(card());
    expect(lines(text).slice(0, 2)).toEqual(['BEGIN:VCARD', 'VERSION:3.0']);
    expect(text.endsWith('END:VCARD\r\n')).toBe(true);
    expect(lines(text)).toContain('FN:Awa Diallo');
    expect(lines(text)).toContain('N:Diallo;Awa;;;');
  });

  it('relit la carte d’origine, champ pour champ', () => {
    const complete = card({
      organization: 'Meeshy SAS',
      title: 'Directrice',
      phones: [
        { label: 'mobile', value: '+33 6 12 34 56 78' },
        { label: 'work', value: '01 23 45 67 89' },
        { label: 'fax', value: '01 99 99 99 99' },
        { label: 'iphone', value: '+221 77 000 00 00' },
        { label: 'Standard du bureau', value: '+33 1 00 00 00 00' },
        { label: null, value: '+33 7 00 00 00 00' },
      ],
      emails: [
        { label: 'home', value: 'awa@example.com' },
        { label: 'work', value: 'awa.diallo@meeshy.me' },
      ],
      urls: ['https://meeshy.me'],
      addresses: [{ label: 'home', value: '12 rue de la Paix, Paris, 75002, France' }],
      birthday: '1990-01-15',
      note: 'Rencontrée à Dakar, 2024\nAppeler le matin; le soir non',
    });
    expect(parseVCard(serializeVCard(complete))).toEqual(complete);
  });

  it('relit une carte qui ne porte qu’un nom affiché, sans en inventer les composantes', () => {
    const bare = card({ givenName: undefined, familyName: undefined, phones: [], emails: [] });
    const { givenName: _g, familyName: _f, ...expected } = bare;
    expect(parseVCard(serializeVCard(bare))).toEqual(expected);
  });

  it('échappe les caractères qui structurent une vCard', () => {
    const text = serializeVCard(card({ formattedName: 'Diallo, Awa; \\ «la grande»', organization: 'A;B' }));
    expect(lines(text)).toContain('FN:Diallo\\, Awa\\; \\\\ «la grande»');
    expect(parseVCard(text)?.formattedName).toBe('Diallo, Awa; \\ «la grande»');
  });

  it('plie les lignes longues à 75 octets sans couper un caractère', () => {
    const longName = 'É'.repeat(80);
    const text = serializeVCard(card({ formattedName: longName }));
    const bytes = (line: string) => new TextEncoder().encode(line).length;
    expect(lines(text).every((line) => bytes(line) <= 75)).toBe(true);
    expect(lines(text).some((line) => line.startsWith(' '))).toBe(true);
    expect(parseVCard(text)?.formattedName).toBe(longName);
  });

  it('garde un anniversaire sans année', () => {
    expect(parseVCard(serializeVCard(card({ birthday: '--03-08' })))?.birthday).toBe('--03-08');
  });

  it('n’écrit aucun champ que la fiche ne porte pas', () => {
    const text = serializeVCard(card({ emails: [] }));
    expect(text).not.toMatch(/^(EMAIL|ADR|URL|BDAY|NOTE|ORG|TITLE|PHOTO)/m);
  });
});

describe('contactCardFileName — le nom du fichier envoyé, miroir d’iOS (#8142)', () => {
  it('porte le nom du contact et l’extension .vcf', () => {
    expect(contactCardFileName('Awa Diallo')).toBe('Awa Diallo.vcf');
    expect(contactCardNameFromFileName(contactCardFileName('Awa Diallo'))).toBe('Awa Diallo');
  });

  it('remplace les caractères interdits dans un nom de fichier', () => {
    expect(contactCardFileName('A/B:C?*"<>|\\')).toBe('A B C.vcf');
  });

  it('borne le nom à 60 caractères et retombe sur « contact »', () => {
    expect(contactCardFileName('x'.repeat(100))).toBe(`${'x'.repeat(60)}.vcf`);
    expect(contactCardFileName('  ')).toBe('contact.vcf');
  });
});
