/**
 * @jest-environment node
 */

import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import {
  FAMILLES,
  carteAudio,
  dureeLisible,
  familleDemandee,
  familleDuMime,
  poidsLisible,
  tuileDuMedia,
  type MediaServi,
} from '@/app/(public)/chats/[lien]/medias/modele';

/**
 * CE QUI SE PEINT DANS LA GRILLE DES MÉDIAS — le modèle, avant le pixel
 * (planche `media`, `cible/media.png`, matrice ordre 7).
 *
 * Trois lois s'y gagent sans navigateur, et ce sont exactement les trois que le
 * critère de fin nomme :
 *
 *   1. le POIDS est connu de la tuile, donc affichable AVANT tout octet ;
 *   2. chaque tuile porte une ADRESSE — un contrôle existe s'il a un effet ;
 *   3. l'audio descend le PRISME, et la piste jouée est celle de la langue
 *      SERVIE (cycle 128 : « un contenu résolu voyage avec son MÉDIUM »).
 */

const PHOTO: MediaServi = {
  id: 'a-1',
  nom: 'marche-de-lagos.jpg',
  url: 'https://gate.test/api/v1/attachments/file/2026/08/a-1.jpg',
  mimeType: 'image/jpeg',
  octets: 420_000,
  dureeMs: null,
  transcription: null,
  traductions: {},
  pistes: {},
  instantMs: Date.parse('2026-08-30T12:01:00.000Z'),
};

const VOCAL: MediaServi = {
  id: 'a-2',
  nom: 'note-vocale.m4a',
  url: 'https://gate.test/api/v1/attachments/file/2026/08/a-2.m4a',
  mimeType: 'audio/mp4',
  octets: 96_000,
  dureeMs: 23_000,
  transcription: { texte: 'Mo ti de ibi ipade.', langue: 'yo' },
  traductions: { fr: 'Je suis arrivé au lieu du rendez-vous.' },
  pistes: { fr: { url: 'https://gate.test/tts/a-2-fr.mp3', mimeType: 'audio/mpeg' } },
  instantMs: Date.parse('2026-08-30T12:02:00.000Z'),
};

describe('la famille d’un média — ce que les quatre puces de la cible trient', () => {
  it('range chaque type MIME dans sa puce', () => {
    expect(familleDuMime('image/jpeg')).toBe('images');
    expect(familleDuMime('video/mp4')).toBe('videos');
    expect(familleDuMime('audio/mp4')).toBe('audio');
    expect(familleDuMime('application/pdf')).toBe('fichiers');
  });

  /**
   * Un type MIME inconnu ne disparaît pas de l'écran : il tombe dans
   * « Fichiers », la seule puce qui ne promette rien de la forme du contenu.
   */
  it('range l’inconnu dans « Fichiers » plutôt que de le perdre', () => {
    expect(familleDuMime('')).toBe('fichiers');
    expect(familleDuMime('application/octet-stream')).toBe('fichiers');
  });

  it('n’accepte de l’URL que les quatre familles, et retombe sur la première', () => {
    expect(FAMILLES).toEqual(['images', 'videos', 'audio', 'fichiers']);
    expect(familleDemandee('audio')).toBe('audio');
    expect(familleDemandee(null)).toBe('images');
    expect(familleDemandee('../../etc')).toBe('images');
  });
});

describe('le POIDS, annoncé avant le premier octet', () => {
  it('rend la valeur de la cible pour la valeur de la cible', () => {
    expect(poidsLisible({ octets: 420_000, langue: 'fr' })).toBe('420 Ko');
  });

  it('monte d’unité sans faire perdre la grandeur', () => {
    expect(poidsLisible({ octets: 512, langue: 'fr' })).toBe('512 o');
    expect(poidsLisible({ octets: 2_400_000, langue: 'fr' })).toBe('2,4 Mo');
    expect(poidsLisible({ octets: 5_000_000_000, langue: 'fr' })).toBe('5 Go');
  });

  /**
   * Un poids que la passerelle n'a pas dit ne s'invente pas : la tuile reste
   * cliquable et se tait, plutôt que d'annoncer « 0 o » sur un fichier plein.
   */
  it('se tait quand la passerelle n’a rien dit', () => {
    expect(poidsLisible({ octets: null, langue: 'fr' })).toBeNull();
  });
});

describe('la DURÉE — « 0:23 » de la cible', () => {
  it('rend minutes et secondes, jamais un nombre de millisecondes', () => {
    expect(dureeLisible(23_000)).toBe('0:23');
    expect(dureeLisible(83_000)).toBe('1:23');
    expect(dureeLisible(null)).toBeNull();
  });
});

describe('la TUILE — un contrôle existe s’il a un effet (loi 4)', () => {
  it('porte l’adresse du média SERVIE telle quelle, jamais reconstruite', () => {
    expect(tuileDuMedia({ media: PHOTO, langueDuDocument: 'fr' }).url).toBe(PHOTO.url);
  });

  it('annonce son poids et nomme ce qu’elle ouvre', () => {
    const tuile = tuileDuMedia({ media: PHOTO, langueDuDocument: 'fr' });

    expect(tuile.poids).toBe('420 Ko');
    expect(tuile.etiquette).toContain('marche-de-lagos.jpg');
    expect(tuile.etiquette).toContain('420 Ko');
  });

  it('prend le glyphe de sa famille — ceux que la cible dessine', () => {
    expect(tuileDuMedia({ media: PHOTO, langueDuDocument: 'fr' }).glyphe).toBe('ph-image');
    expect(
      tuileDuMedia({ media: { ...PHOTO, mimeType: 'video/mp4' }, langueDuDocument: 'fr' }).glyphe,
    ).toBe('ph-play-circle');
    expect(
      tuileDuMedia({ media: { ...PHOTO, mimeType: 'application/pdf' }, langueDuDocument: 'fr' })
        .glyphe,
    ).toBe('ph-file');
  });
});

describe('la CARTE AUDIO — le Prisme descend, et la piste suit le texte', () => {
  it('sert la traduction du rang du lecteur et l’ANNONCE par sa langue', () => {
    const carte = carteAudio({
      media: VOCAL,
      prisme: ['fr', 'yo'],
      langueDuDocument: 'fr',
    });

    expect(carte.texte).toBe('Je suis arrivé au lieu du rendez-vous.');
    expect(carte.mention).toBe('Transcrit · yo → fr');
  });

  /**
   * LA RÈGLE 3 DU PRISME, gagée sur un rang AUTRE que le premier : la langue
   * d'origine concourt à SON rang, jamais comme court-circuit. Prisme
   * `['fr','yo']`, transcription yoruba, traduction française disponible ⇒ le
   * français. Le témoin tomberait si quelqu'un réécrivait « si la langue
   * d'origine appartient au prisme ⇒ servir l'original ».
   */
  it('ne court-circuite pas au profit de la langue d’origine', () => {
    const carte = carteAudio({ media: VOCAL, prisme: ['fr', 'yo'], langueDuDocument: 'fr' });

    expect(carte.texte).not.toBe(VOCAL.transcription?.texte);
  });

  /**
   * `lang` ne se pose que là où la langue SERVIE diffère de celle du document —
   * sinon chaque carte porterait une redondance que les lecteurs d'écran
   * annoncent.
   */
  it('ne pose `lang` que sur une langue autre que celle du document', () => {
    expect(carteAudio({ media: VOCAL, prisme: ['fr'], langueDuDocument: 'fr' }).langue).toBeNull();
    expect(carteAudio({ media: VOCAL, prisme: ['fr'], langueDuDocument: 'en' }).langue).toBe('fr');
  });

  /**
   * Aucune traduction au prisme du lecteur ⇒ l'ORIGINAL, avec sa propre langue
   * (règle 1 du Prisme). Jamais `translations.first`.
   */
  it('retombe sur l’original quand aucun rang n’est servi', () => {
    const carte = carteAudio({ media: VOCAL, prisme: ['de'], langueDuDocument: 'fr' });

    expect(carte.texte).toBe('Mo ti de ibi ipade.');
    expect(carte.langue).toBe('yo');
    expect(carte.mention).toBe('Transcrit · yo');
  });

  /**
   * LE CYCLE 128 — la piste jouée est élue par la langue du TEXTE SERVI, jamais
   * par une descente indépendante : une transcription française au-dessus d'une
   * piste yoruba serait un défaut PIRE que l'absence de traduction.
   */
  it('joue la piste de la langue servie, et l’original quand elle n’existe pas', () => {
    expect(carteAudio({ media: VOCAL, prisme: ['fr'], langueDuDocument: 'fr' }).url).toBe(
      'https://gate.test/tts/a-2-fr.mp3',
    );
    expect(carteAudio({ media: VOCAL, prisme: ['de'], langueDuDocument: 'fr' }).url).toBe(VOCAL.url);
  });

  /**
   * Une traduction TEXTE peut exister sans que le TTS ait produit sa piste
   * (`transcriptTranslationTracks` ne rend pas le même jeu de langues que sa
   * jumelle). Le texte servi reste le texte traduit ; le son retombe sur
   * l'original — jamais l'inverse.
   */
  it('sert le texte traduit même quand aucune piste ne l’accompagne', () => {
    const sansPiste: MediaServi = { ...VOCAL, pistes: {} };
    const carte = carteAudio({ media: sansPiste, prisme: ['fr'], langueDuDocument: 'fr' });

    expect(carte.texte).toBe('Je suis arrivé au lieu du rendez-vous.');
    expect(carte.url).toBe(VOCAL.url);
  });

  it('se tait quand rien n’a été transcrit, sans perdre le média', () => {
    const muet: MediaServi = { ...VOCAL, transcription: null, traductions: {}, pistes: {} };
    const carte = carteAudio({ media: muet, prisme: ['fr'], langueDuDocument: 'fr' });

    expect(carte.texte).toBeNull();
    expect(carte.mention).toBeNull();
    expect(carte.url).toBe(muet.url);
    expect(carte.duree).toBe('0:23');
  });

  it('annonce le poids du fichier comme les tuiles', () => {
    expect(
      carteAudio({ media: VOCAL, prisme: ['fr'], langueDuDocument: DOCUMENT_LANGUAGE }).poids,
    ).toBe('96 Ko');
  });
});
