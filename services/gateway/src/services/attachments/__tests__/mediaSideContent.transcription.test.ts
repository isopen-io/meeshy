/**
 * #19978 — **l'adresse est gardée, les mots ne le sont pas.**
 *
 * `mediaSideContent.ts` nomme en PREMIER, dans son en-tête, ce qu'il est censé
 * gouverner : « ce qui voyage À CÔTÉ d'un média — **sa transcription en
 * sous-titres**, sa description textuelle et ses traductions ». La loi était
 * pourtant appliquée à `alt` SEULEMENT (`servedDescription`), aux sous-titres
 * (`servedSubtitles`) et aux deux projections d'administration — et pas aux
 * DEUX chemins les plus fréquentés, qui répandent la ligne brute :
 * `serializeAttachmentForSocket` (les trois familles socket) et
 * `cleanAttachmentsForApi` (la liste REST).
 *
 * Pour un VOCAL à vue unique, #19939 signe désormais l'adresse du fichier — et
 * la même entrée Redis gardait 48 h, EN CLAIR, tout le texte prononcé.
 *
 * Ce que la loi retient est le TEXTE, jamais le MÉDIUM : `url`, `durationMs` et
 * `format` d'une piste traduite restent (ils sont gardés par leur propre loi,
 * la signature par lecteur), `transcription` et `segments` partent.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';

import { servedSideContent } from '../mediaSideContent';

const PISTE = {
  fr: { type: 'audio', transcription: 'le secret dit à voix haute', url: '/f/fr.mp3', durationMs: 12_000, format: 'mp3' },
  en: { type: 'audio', transcription: 'the secret, spoken', path: '/disk/en.mp3', url: '/f/en.mp3' },
} as const;

const TRANSCRIPTION = { text: 'le secret dit à voix haute', segments: [{ text: 'le secret', start: 0, end: 1 }] };

const ordinaire = {
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  transcription: TRANSCRIPTION,
  translations: PISTE,
  alt: 'une photo',
  altLanguage: 'fr',
  altTranslations: { en: 'a photo' },
} as const;

describe('servedSideContent — le texte qui accompagne un média protégé ne voyage pas', () => {
  it('sert tout, sans la clé disque, sur une pièce ORDINAIRE', () => {
    const servi = servedSideContent({ ...ordinaire });

    expect(servi.transcription).toEqual(TRANSCRIPTION);
    expect(servi.alt).toBe('une photo');
    expect((servi.translations as Record<string, Record<string, unknown>>).fr?.transcription).toBe('le secret dit à voix haute');
    expect((servi.translations as Record<string, Record<string, unknown>>).en).not.toHaveProperty('path');
  });

  it('retire la TRANSCRIPTION entière quand la pièce est à vue unique', () => {
    const servi = servedSideContent({ ...ordinaire, isViewOnce: true });

    expect(servi.transcription).toBeNull();
    expect(servi.alt).toBeNull();
  });

  it('retire les MOTS des pistes traduites, et garde leur MÉDIUM', () => {
    const servi = servedSideContent({ ...ordinaire, isViewOnce: true });
    const pistes = servi.translations as Record<string, Record<string, unknown>>;

    expect(pistes.fr).not.toHaveProperty('transcription');
    expect(pistes.fr).not.toHaveProperty('segments');
    expect(pistes.fr?.url).toBe('/f/fr.mp3');
    expect(pistes.fr?.durationMs).toBe(12_000);
    expect(pistes.en).not.toHaveProperty('path');
  });

  it('obéit à la protection du MESSAGE PORTEUR, pas seulement à celle de la pièce', () => {
    const servi = servedSideContent({ ...ordinaire, message: { isViewOnce: false, isBlurred: false, effectFlags: 0, expiresAt: new Date(), deletedAt: null } });

    expect(servi.transcription).toBeNull();
    expect((servi.translations as Record<string, Record<string, unknown>>).fr).not.toHaveProperty('transcription');
  });

  it("ferme sur un message SUPPRIMÉ, et sur une pièce CHIFFRÉE", () => {
    expect(servedSideContent({ ...ordinaire, message: { deletedAt: new Date() } }).transcription).toBeNull();
    expect(servedSideContent({ ...ordinaire, isEncrypted: true }).transcription).toBeNull();
  });

  it('traverse une pièce sans aucun contenu latéral sans rien fabriquer', () => {
    const servi = servedSideContent({ isViewOnce: false, isBlurred: false, effectFlags: 0 });

    expect(servi).toEqual({ alt: null, altLanguage: null, altTranslations: null, transcription: null, translations: null });
  });
});
