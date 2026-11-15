/**
 * #14309 — une notification décrit le contenu reçu, elle ne le montre jamais.
 */
import { describe, expect, it } from '@jest/globals';

import {
  attachmentsSynthesis,
  contentSynthesis,
  textSynthesis,
  textSynthesisLabels,
} from '../content-synthesis';
import { NOTIFICATION_LANGUAGES } from '@meeshy/shared/utils/notification-strings';

const words = (n: number): string => Array.from({ length: n }, (_, i) => `mot${i}`).join(' ');

describe('textSynthesis — la longueur du texte, jamais le texte', () => {
  it.each([
    [1, 'Petit mot reçu'],
    [2, 'Petit message texte'],
    [4, 'Petit message texte'],
    [5, 'Message texte'],
    [29, 'Message texte'],
    [30, 'Long message texte'],
    [99, 'Long message texte'],
    [100, 'Petit essai texte'],
    [299, 'Petit essai texte'],
    [300, 'Essai texte'],
    [599, 'Essai texte'],
    [600, 'Long essai texte'],
    [2000, 'Long essai texte'],
  ])('%i mots → « %s »', (n, label) => {
    expect(textSynthesis('fr', words(n))).toBe(label);
  });

  it('un texte vide ne dit rien', () => {
    expect(textSynthesis('fr', '   ')).toBe('');
  });

  it('un émoji seul compte pour un mot', () => {
    expect(textSynthesis('fr', '😂')).toBe('Petit mot reçu');
  });

  it('compte les mots d’une écriture sans espaces (chinois)', () => {
    expect(textSynthesis('fr', '我们明天在火车站见面吧')).not.toBe('Petit mot reçu');
  });

  it('parle la langue de cadrage du destinataire', () => {
    expect(textSynthesis('en-US', words(10))).toBe('Text message');
    expect(textSynthesis('de', words(1))).toBe('Ein Wort');
  });

  it('les huit langues portent sept paliers distincts', () => {
    NOTIFICATION_LANGUAGES.forEach((lang) => {
      const labels = textSynthesisLabels(lang);
      expect(new Set(labels).size).toBe(7);
      labels.forEach((label) => expect(label.trim()).not.toBe(''));
    });
  });
});

describe('attachmentsSynthesis — la nature de la pièce jointe, jamais son contenu', () => {
  it.each([
    [{ mimeType: 'image/jpeg', fileName: 'a.jpg' }, 'Image haute définition'],
    [{ mimeType: 'image/gif', fileName: 'a.gif' }, 'Image animée'],
    [{ mimeType: 'video/mp4', fileName: 'a.mp4' }, 'Vidéo haute définition'],
    [{ mimeType: 'audio/mpeg', fileName: 'chanson.mp3' }, 'Audio haute définition'],
    [{ mimeType: 'audio/mp4', fileName: 'voice_1730000000.m4a' }, 'Vocal haute définition'],
    [{ mimeType: 'application/pdf', fileName: 'x.pdf', pageCount: 12 }, 'PDF de 12 pages'],
    [{ mimeType: 'application/pdf', fileName: 'x.pdf', pageCount: 1 }, 'PDF d’une page'],
    [{ mimeType: 'application/pdf', fileName: 'x.pdf' }, 'Document PDF'],
    [{ mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileName: 'x.docx', pageCount: 3 }, 'Document de 3 pages'],
    [{ mimeType: 'application/msword', fileName: 'x.doc' }, 'Document'],
    [{ mimeType: 'text/plain', fileName: 'notes.txt', lineCount: 42 }, 'Fichier texte de 42 lignes'],
    [{ mimeType: 'application/json', fileName: 'data.json' }, 'Fichier texte'],
    [{ mimeType: 'application/vnd.ms-excel', fileName: 'x.xlsx' }, 'Tableur'],
    [{ mimeType: 'application/vnd.ms-powerpoint', fileName: 'x.pptx', pageCount: 8 }, 'Présentation de 8 diapositives'],
    [{ mimeType: 'application/zip', fileName: 'x.zip' }, 'Archive compressée'],
    [{ mimeType: 'text/vcard', fileName: 'Jean Dupont.vcf' }, 'Carte de visite'],
    [{ mimeType: 'application/octet-stream', fileName: 'x.bin' }, 'Fichier'],
  ])('%o → « %s »', (attachment, label) => {
    expect(attachmentsSynthesis('fr', [attachment])).toBe(label);
  });

  it('ne cite ni le nom du fichier ni celui du contact', () => {
    const body = attachmentsSynthesis('fr', [{ mimeType: 'text/vcard', fileName: 'x.vcf', originalName: 'Jean Dupont.vcf' }]);
    expect(body).not.toContain('Jean');
  });

  it('plusieurs pièces d’une même nature se comptent', () => {
    const images = Array.from({ length: 3 }, () => ({ mimeType: 'image/png', fileName: 'a.png' }));
    expect(attachmentsSynthesis('fr', images)).toBe('3 images');
  });

  it('plusieurs natures se listent, la plus nombreuse d’abord', () => {
    expect(attachmentsSynthesis('fr', [
      { mimeType: 'video/mp4', fileName: 'a.mp4' },
      { mimeType: 'image/png', fileName: 'a.png' },
      { mimeType: 'image/png', fileName: 'b.png' },
      { mimeType: 'application/pdf', fileName: 'c.pdf' },
    ])).toBe('2 images, 1 vidéo, 1 PDF');
  });

  it('les huit langues décrivent chaque nature', () => {
    NOTIFICATION_LANGUAGES.forEach((lang) => {
      expect(attachmentsSynthesis(lang, [{ mimeType: 'image/png', fileName: 'a.png' }])).not.toBe('');
      expect(attachmentsSynthesis(lang, [{ mimeType: 'application/pdf', fileName: 'a.pdf', pageCount: 4 }])).toContain('4');
    });
  });
});

describe('contentSynthesis — texte et pièces jointes ensemble', () => {
  it('une photo légendée dit les deux', () => {
    expect(contentSynthesis('fr', {
      text: 'Regarde ce coucher',
      attachments: [{ mimeType: 'image/jpeg', fileName: 'a.jpg' }],
    })).toBe('Petit message texte · Image haute définition');
  });

  it('un lien se dit lien, son adresse ne part pas', () => {
    const body = contentSynthesis('fr', {
      text: 'https://example.com/secret-path',
      attachments: [],
      detail: { link: { url: 'https://example.com/secret-path', domain: 'example.com' } },
    });
    expect(body).toBe('Lien web');
  });

  it('une position se dit position, son adresse ne part pas', () => {
    const body = contentSynthesis('fr', {
      text: '',
      attachments: [],
      detail: { location: { latitude: 1, longitude: 2, name: 'Chez moi', address: '3 rue X' } },
    });
    expect(body).toBe('Position partagée');
  });

  it('rien du tout ⇒ chaîne vide', () => {
    expect(contentSynthesis('fr', { text: '', attachments: [] })).toBe('');
  });
});
