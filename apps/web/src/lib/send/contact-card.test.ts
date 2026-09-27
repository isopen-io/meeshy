import { describe, expect, test } from 'bun:test';

import { parseVCard } from '@meeshy/shared/utils/vcard';

import type { CoqueNative } from '@/lib/native-shell';

import {
  contactCardFile,
  contactFromVCardFile,
  contactSourceOf,
  pickContact,
  type ContactHost,
  type PickedContact,
} from './contact-card';

/**
 * ENVOYER UN CONTACT DEPUIS LE WEB (#8242) — trois sources, dans l'ordre où
 * elles se préfèrent : le sélecteur NATIF de la coque Android, l'API Contact
 * Picker du navigateur (Chrome Android), et à défaut une fiche `.vcf`. Les
 * trois rendent la MÊME carte, écrite par `serializeVCard` (partagé) : c'est
 * ce que ces témoins lisent, jamais la plomberie.
 */

const shellWith = (pick: (options: object) => Promise<unknown>): CoqueNative => ({
  PluginHeaders: [{ name: 'MeeshyContacts', methods: [{ name: 'pick' }] }],
  nativePromise: (_plugin, _method, options) => pick(options),
});

const pickerWith = (contacts: readonly PickedContact[], properties = ['name', 'tel', 'email', 'address']) => {
  const asked: string[][] = [];
  const nav = {
    contacts: {
      getProperties: async () => properties,
      select: async (props: readonly string[]) => {
        asked.push([...props]);
        return contacts;
      },
    },
  };
  return { nav, asked };
};

const host = (overrides: Partial<ContactHost> = {}): ContactHost => ({ coque: undefined, nav: {}, ...overrides });

const textOf = (file: File): Promise<string> => file.text();

describe('la source du contact se choisit sans demander', () => {
  test('dans la coque Android qui déclare le sélecteur natif : le sélecteur natif', () => {
    expect(contactSourceOf(host({ coque: shellWith(async () => ({})), nav: pickerWith([]).nav }))).toBe('shell');
  });

  test('dans un navigateur qui offre l’API Contact Picker : cette API', () => {
    expect(contactSourceOf(host({ nav: pickerWith([]).nav }))).toBe('picker');
  });

  test('ailleurs : une fiche .vcf, jamais une tuile inerte', () => {
    expect(contactSourceOf(host())).toBe('file');
  });

  test('une coque construite AVANT le sélecteur retombe sur le navigateur', () => {
    const oldShell: CoqueNative = { PluginHeaders: [{ name: 'MeeshyShare' }], nativePromise: async () => ({}) };
    expect(contactSourceOf(host({ coque: oldShell }))).toBe('file');
  });
});

describe('le sélecteur natif de la coque', () => {
  test('rend la fiche CHOISIE, avec ses numéros étiquetés', async () => {
    const card = await pickContact(
      'shell',
      host({
        coque: shellWith(async () => ({
          name: 'Awa Diallo',
          phones: [
            { value: '+33 6 12 34 56 78', label: 'mobile' },
            { value: '01 23 45 67 89', label: 'Bureau' },
          ],
        })),
      }),
    );
    expect(card).toEqual({
      formattedName: 'Awa Diallo',
      phones: [
        { label: 'mobile', value: '+33 6 12 34 56 78' },
        { label: 'Bureau', value: '01 23 45 67 89' },
      ],
      emails: [],
      urls: [],
      addresses: [],
    });
  });

  test('un sélecteur fermé sans choix n’envoie RIEN', async () => {
    const cancelled = shellWith(async () => {
      throw Object.assign(new Error('annulé'), { code: 'CANCELED' });
    });
    expect(await pickContact('shell', host({ coque: cancelled }))).toBeNull();
  });

  test('une réponse illisible est un échec DIT, jamais une carte vide', async () => {
    const outcomeOf = (payload: unknown) =>
      pickContact('shell', host({ coque: shellWith(async () => payload) })).then(
        () => 'rendue',
        () => 'refusée',
      );
    expect(await outcomeOf({ phones: 'x' })).toBe('refusée');
    expect(await outcomeOf({})).toBe('refusée');
    expect(await outcomeOf({ name: '   ', phones: [{ value: ' ' }] })).toBe('refusée');
  });
});

describe('l’API Contact Picker', () => {
  test('ne demande QUE les propriétés que le navigateur sait servir, une seule fiche', async () => {
    const { nav, asked } = pickerWith([{ name: ['Awa'], tel: ['+221 77 000 00 00'] }], ['name', 'tel']);
    await pickContact('picker', host({ nav }));
    expect(asked).toEqual([['name', 'tel']]);
  });

  test('compose la carte de la fiche choisie, adresse comprise', async () => {
    const { nav } = pickerWith([
      {
        name: ['Awa Diallo'],
        tel: ['+33 6 12 34 56 78'],
        email: ['awa@example.com'],
        address: [{ addressLine: ['12 rue de la Paix'], city: 'Paris', postalCode: '75002', country: 'France' }],
      },
    ]);
    expect(await pickContact('picker', host({ nav }))).toEqual({
      formattedName: 'Awa Diallo',
      phones: [{ label: null, value: '+33 6 12 34 56 78' }],
      emails: [{ label: null, value: 'awa@example.com' }],
      urls: [],
      addresses: [{ label: null, value: '12 rue de la Paix, Paris, 75002, France' }],
    });
  });

  test('sans nom, la carte prend le premier numéro', async () => {
    const { nav } = pickerWith([{ name: [], tel: ['+33 6 12 34 56 78'] }]);
    expect((await pickContact('picker', host({ nav })))?.formattedName).toBe('+33 6 12 34 56 78');
  });

  test('aucune fiche choisie : rien ne part', async () => {
    expect(await pickContact('picker', host({ nav: pickerWith([]).nav }))).toBeNull();
  });
});

describe('une fiche .vcf choisie sur l’ordinateur', () => {
  const vcf = (text: string, name = 'awa.vcf', type = '') => new File([text], name, { type });

  test('seule la PREMIÈRE carte part, relue champ par champ — la photo et les autres fiches restent', async () => {
    const card = await contactFromVCardFile(
      vcf(
        [
          'BEGIN:VCARD',
          'VERSION:3.0',
          'FN:Awa Diallo',
          'TEL;TYPE=CELL:+33 6 12 34 56 78',
          'PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQ',
          'END:VCARD',
          'BEGIN:VCARD',
          'VERSION:3.0',
          'FN:Autre personne',
          'END:VCARD',
        ].join('\r\n'),
      ),
    );
    if (card === null) throw new Error('La fiche devait se lire');
    expect(card.formattedName).toBe('Awa Diallo');
    const text = await textOf(contactCardFile(card));
    expect(text).not.toContain('PHOTO');
    expect(text).not.toContain('Autre personne');
  });

  test('un fichier qui n’est pas une carte est refusé', async () => {
    expect(await contactFromVCardFile(vcf('bonjour', 'notes.txt'))).toBeNull();
  });
});

describe('la pièce qui part', () => {
  test('est un text/vcard nommé comme le contact, que parseVCard relit', async () => {
    const file = contactCardFile({
      formattedName: 'Awa Diallo',
      phones: [{ label: 'mobile', value: '+33 6 12 34 56 78' }],
      emails: [],
      urls: [],
      addresses: [],
    });
    expect(file.type).toBe('text/vcard');
    expect(file.name).toBe('Awa Diallo.vcf');
    expect(parseVCard(await textOf(file))?.phones).toEqual([{ label: 'mobile', value: '+33 6 12 34 56 78' }]);
  });
});
