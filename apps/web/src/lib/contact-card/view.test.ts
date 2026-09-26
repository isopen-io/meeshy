import { beforeAll, describe, expect, test } from 'bun:test';

import { parseVCard } from '@meeshy/shared/utils/vcard';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { contactInitials, contactRelationView, vcardFieldRows } from './view';

/**
 * CE QUE LA CARTE MONTRE ET OFFRE (#8101). Les libellés se lisent sur un
 * TEXTE anglais, jamais sur une clé — une clé absente ne peut pas produire
 * « Phone · mobile ».
 */

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
  await loadInterfaceCatalog('en');
});

describe('contactRelationView', () => {
  test('les gestes offerts suivent la relation du lecteur', () => {
    expect(contactRelationView('none').actions).toEqual(['connect', 'write']);
    expect(contactRelationView('friend')).toEqual({ actions: ['write'], state: null });
    expect(contactRelationView('self')).toEqual({ actions: [], state: 'contactCard.state.self' });
    expect(contactRelationView('request-sent')).toEqual({ actions: ['write'], state: 'contactCard.state.requestSent' });
    expect(contactRelationView('request-received').actions).not.toContain('connect');
  });
});

describe('vcardFieldRows', () => {
  const card = parseVCard(
    [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Awa Diallo',
      'ORG:Meeshy SAS',
      'TITLE:Directrice',
      'item1.TEL;type=CELL:+33 6 12 34 56 78',
      'item2.EMAIL:awa@example.com',
      'item2.X-ABLabel:Perso',
      'ADR;TYPE=HOME:;;12 rue de la Paix;Paris;;75002;France',
      'URL:https://meeshy.me',
      'BDAY:1990-01-15',
      'NOTE:Appeler le matin',
      'END:VCARD',
    ].join('\n'),
  );

  test('liste TOUS les champs, chacun avec son libellé localisé', () => {
    expect(card && vcardFieldRows(card, 'en').map((row) => [row.label, row.value])).toEqual([
      ['Phone · mobile', '+33 6 12 34 56 78'],
      ['Email · Perso', 'awa@example.com'],
      ['Organization', 'Meeshy SAS'],
      ['Job title', 'Directrice'],
      ['Address · home', '12 rue de la Paix, Paris, 75002, France'],
      ['Website', 'https://meeshy.me'],
      ['Birthday', '1990-01-15'],
      ['Note', 'Appeler le matin'],
    ]);
  });

  test('traduit le libellé connu, garde le libellé libre de l’auteur', () => {
    expect(card && vcardFieldRows(card, 'fr').slice(0, 2).map((row) => row.label)).toEqual(['Téléphone · mobile', 'E-mail · Perso']);
  });
});

describe('contactInitials', () => {
  test('deux initiales au plus, un dièse sans lettre', () => {
    expect(contactInitials('Awa Diallo')).toBe('AD');
    expect(contactInitials('Élodie')).toBe('É');
    expect(contactInitials('Jean Paul Kouassi')).toBe('JK');
    expect(contactInitials('+33 6 12')).toBe('#');
  });
});
