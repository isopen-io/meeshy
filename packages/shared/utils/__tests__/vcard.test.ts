import { describe, it, expect } from 'vitest';
import {
  parseVCard,
  isContactCardMimeType,
  isContactCardAttachment,
  normalizeContactCardMimeType,
  buildResolveContactsRequest,
} from '../vcard';

const crlf = (lines: readonly string[]): string => lines.join('\r\n');

const iphoneCard = (): string =>
  crlf([
    'BEGIN:VCARD',
    'VERSION:3.0',
    'PRODID:-//Apple Inc.//iPhone OS 17.0//EN',
    'N:Diallo;Awa;;;',
    'FN:Awa Diallo',
    'ORG:Meeshy SAS;',
    'TITLE:Directrice',
    'item1.TEL;type=CELL;type=VOICE;type=pref:+33 6 12 34 56 78',
    'item1.X-ABLabel:_$!<Mobile>!$_',
    'TEL;type=HOME;type=VOICE:01 23 45 67 89',
    'item2.EMAIL;type=INTERNET;type=pref:awa@example.com',
    'item2.X-ABLabel:Perso',
    'EMAIL;type=INTERNET;type=WORK:awa.diallo@meeshy.me',
    'item3.ADR;type=HOME;type=pref:;;12 rue de la Paix;Paris;;75002;France',
    'item3.X-ABADR:fr',
    'item4.URL;type=pref:https://meeshy.me',
    'BDAY:1990-01-15',
    'NOTE:Rencontrée à Dakar\\, 2024\\nAppeler le matin',
    'PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQAAAQABAAD/',
    ' 2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0',
    'END:VCARD',
    '',
  ]);

const androidCard = (): string =>
  crlf([
    'BEGIN:VCARD',
    'VERSION:2.1',
    'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=C3=89lodie;Ren=C3=A9e;;;',
    'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Ren=C3=A9e =C3=89lodie',
    'TEL;CELL;PREF:+221771234567',
    'TEL;WORK:338001122',
    'EMAIL;HOME:renee@example.sn',
    'NOTE;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:Ligne un=0D=0ALigne deux tr=C3=A8s =',
    'longue suite',
    'END:VCARD',
  ]);

describe('parseVCard — vCard 3.0 exportée par un iPhone', () => {
  it('rend le nom du carnet de l’auteur et ses composantes', () => {
    const card = parseVCard(iphoneCard());
    expect(card?.formattedName).toBe('Awa Diallo');
    expect(card?.givenName).toBe('Awa');
    expect(card?.familyName).toBe('Diallo');
    expect(card?.organization).toBe('Meeshy SAS');
    expect(card?.title).toBe('Directrice');
  });

  it('étiquette les numéros par leur type ou le libellé Apple de leur groupe', () => {
    expect(parseVCard(iphoneCard())?.phones).toEqual([
      { label: 'mobile', value: '+33 6 12 34 56 78' },
      { label: 'home', value: '01 23 45 67 89' },
    ]);
  });

  it('garde un libellé libre de l’auteur tel quel', () => {
    expect(parseVCard(iphoneCard())?.emails).toEqual([
      { label: 'Perso', value: 'awa@example.com' },
      { label: 'work', value: 'awa.diallo@meeshy.me' },
    ]);
  });

  it('compose l’adresse, l’URL, l’anniversaire et la note échappée', () => {
    const card = parseVCard(iphoneCard());
    expect(card?.addresses).toEqual([{ label: 'home', value: '12 rue de la Paix, Paris, 75002, France' }]);
    expect(card?.urls).toEqual(['https://meeshy.me']);
    expect(card?.birthday).toBe('1990-01-15');
    expect(card?.note).toBe('Rencontrée à Dakar, 2024\nAppeler le matin');
  });

  it('ignore la photo encodée repliée sur plusieurs lignes', () => {
    const card = parseVCard(iphoneCard());
    expect(JSON.stringify(card)).not.toContain('9j/4AAQ');
  });
});

describe('parseVCard — vCard 2.1 exportée par Android (QUOTED-PRINTABLE)', () => {
  it('décode le QUOTED-PRINTABLE en UTF-8', () => {
    const card = parseVCard(androidCard());
    expect(card?.formattedName).toBe('Renée Élodie');
    expect(card?.familyName).toBe('Élodie');
    expect(card?.givenName).toBe('Renée');
  });

  it('lit les types nus de la 2.1', () => {
    const card = parseVCard(androidCard());
    expect(card?.phones).toEqual([
      { label: 'mobile', value: '+221771234567' },
      { label: 'work', value: '338001122' },
    ]);
    expect(card?.emails).toEqual([{ label: 'home', value: 'renee@example.sn' }]);
  });

  it('suit les sauts de ligne doux du QUOTED-PRINTABLE', () => {
    expect(parseVCard(androidCard())?.note).toBe('Ligne un\r\nLigne deux très longue suite');
  });

  it('décode un CHARSET ISO-8859-1', () => {
    const card = parseVCard(
      crlf(['BEGIN:VCARD', 'VERSION:2.1', 'FN;CHARSET=ISO-8859-1;ENCODING=QUOTED-PRINTABLE:Jos=E9 Garc=EDa', 'END:VCARD']),
    );
    expect(card?.formattedName).toBe('José García');
  });
});

describe('parseVCard — vCard 4.0', () => {
  const v4 = (): string =>
    [
      'BEGIN:VCARD',
      'VERSION:4.0',
      'FN:Kofi Mensah',
      'TEL;TYPE="cell,voice";VALUE=uri:tel:+233-24-123-4567',
      'EMAIL;TYPE=work:kofi@example.com',
      'BDAY:--0412',
      'END:VCARD',
    ].join('\n');

  it('retire le schéma tel: et lit un TYPE entre guillemets', () => {
    expect(parseVCard(v4())?.phones).toEqual([{ label: 'mobile', value: '+233-24-123-4567' }]);
  });

  it('garde un anniversaire sans année', () => {
    expect(parseVCard(v4())?.birthday).toBe('--04-12');
  });
});

describe('parseVCard — pliage et replis', () => {
  it('déplie une ligne pliée par une tabulation', () => {
    const card = parseVCard(['BEGIN:VCARD', 'VERSION:3.0', 'FN:Jean-Baptiste', '\t Kouassi', 'END:VCARD'].join('\r\n'));
    expect(card?.formattedName).toBe('Jean-Baptiste Kouassi');
  });

  it('compose le nom depuis N quand FN manque', () => {
    const card = parseVCard(['BEGIN:VCARD', 'VERSION:3.0', 'N:Ndiaye;Moussa;;Dr;', 'END:VCARD'].join('\n'));
    expect(card?.formattedName).toBe('Dr Moussa Ndiaye');
  });

  it('retombe sur l’organisation puis sur le premier numéro', () => {
    expect(parseVCard('BEGIN:VCARD\nVERSION:3.0\nORG:Boulangerie Kane\nEND:VCARD')?.formattedName).toBe('Boulangerie Kane');
    expect(parseVCard('BEGIN:VCARD\nVERSION:3.0\nTEL:+221770000000\nEND:VCARD')?.formattedName).toBe('+221770000000');
  });

  it('rend null sur un texte qui n’est pas une vCard', () => {
    expect(parseVCard('bonjour')).toBeNull();
    expect(parseVCard('')).toBeNull();
  });

  it('ne lit que la première carte d’un fichier qui en porte plusieurs', () => {
    const two = 'BEGIN:VCARD\nFN:Un\nEND:VCARD\nBEGIN:VCARD\nFN:Deux\nEND:VCARD';
    expect(parseVCard(two)?.formattedName).toBe('Un');
  });

  it('écarte les valeurs vides et les doublons', () => {
    const card = parseVCard('BEGIN:VCARD\nFN:A\nTEL:\nTEL:+33600000000\nTEL;TYPE=CELL:+33600000000\nEND:VCARD');
    expect(card?.phones).toEqual([{ label: null, value: '+33600000000' }]);
  });
});

describe('type MIME d’une carte de visite', () => {
  it('reconnaît text/vcard et ses alias', () => {
    expect(isContactCardMimeType('text/vcard')).toBe(true);
    expect(isContactCardMimeType('text/x-vcard')).toBe(true);
    expect(isContactCardMimeType('TEXT/VCARD; charset=utf-8')).toBe(true);
    expect(isContactCardMimeType('text/directory')).toBe(true);
    expect(isContactCardMimeType('text/plain')).toBe(false);
  });

  it('normalise vers text/vcard, y compris un .vcf déclaré octet-stream', () => {
    expect(normalizeContactCardMimeType('text/x-vcard', 'a.vcf')).toBe('text/vcard');
    expect(normalizeContactCardMimeType('application/octet-stream', 'Awa.VCF')).toBe('text/vcard');
    expect(normalizeContactCardMimeType('', 'awa.vcard')).toBe('text/vcard');
    expect(normalizeContactCardMimeType('image/png', 'a.vcf')).toBe('image/png');
    expect(normalizeContactCardMimeType('application/pdf', 'a.pdf')).toBe('application/pdf');
  });

  it('reconnaît une pièce jointe carte de visite', () => {
    expect(isContactCardAttachment({ mimeType: 'text/vcard', fileName: 'x' })).toBe(true);
    expect(isContactCardAttachment({ mimeType: 'application/octet-stream', fileName: 'x.vcf' })).toBe(true);
    expect(isContactCardAttachment({ mimeType: 'application/pdf', fileName: 'x.pdf' })).toBe(false);
  });
});

describe('buildResolveContactsRequest', () => {
  it('extrait numéros et e-mails bornés à dix, sans doublon', () => {
    const card = parseVCard(iphoneCard());
    expect(card && buildResolveContactsRequest(card)).toEqual({
      phones: ['+33 6 12 34 56 78', '01 23 45 67 89'],
      emails: ['awa@example.com', 'awa.diallo@meeshy.me'],
    });
  });

  it('borne chaque liste à dix identifiants', () => {
    const lines = Array.from({ length: 14 }, (_, i) => `TEL:+3360000000${String(i).padStart(2, '0')}`);
    const card = parseVCard(['BEGIN:VCARD', 'FN:X', ...lines, 'END:VCARD'].join('\n'));
    expect(card && buildResolveContactsRequest(card).phones).toHaveLength(10);
  });
});
