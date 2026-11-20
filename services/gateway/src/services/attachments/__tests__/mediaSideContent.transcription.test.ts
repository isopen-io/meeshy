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
 * Ce lot ferme la transcription ORIGINALE. Le texte TRADUIT reste servi, et
 * c'est une dette écrite (#20015) : le contrat partagé déclare `transcription`
 * REQUISE sur chaque piste, et `fast-json-stringify` lève sur une requise
 * absente — retirer la clé rendait la liste et `/sync` en 500.
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

  /**
   * **La carte des pistes est INCHANGÉE, et c'est un témoin de NON-action.**
   *
   * La première rédaction en retirait les mots. Deux mesures l'ont interdit :
   * le contrat partagé déclare `transcription` REQUISE sur chaque entrée et
   * `fast-json-stringify` LÈVE sur une requise absente (500 sur la liste et sur
   * `/sync`, page entière) ; et la piste est élue par la langue du TEXTE servi,
   * donc vider les mots rend les `url` qu'on croyait garder inatteignables.
   *
   * Ce témoin garde la dette À L'ENDROIT où quelqu'un voudra la solder : s'il
   * retire les mots sans toucher au schéma partagé, il tombe.
   */
  it('laisse la carte des pistes traduites INTACTE, clé disque exceptée (dette #20015)', () => {
    const servi = servedSideContent({ ...ordinaire, isViewOnce: true });
    const pistes = servi.translations as Record<string, Record<string, unknown>>;

    // Le contrat partagé exige cette clé — la retirer fait LEVER le sérialiseur.
    expect(pistes.fr).toHaveProperty('transcription');
    expect(pistes.fr?.url).toBe('/f/fr.mp3');
    expect(pistes.fr?.durationMs).toBe(12_000);
    // La seule chose que ce chemin retirait déjà avant le lot.
    expect(pistes.en).not.toHaveProperty('path');
  });

  it('obéit à la protection du MESSAGE PORTEUR, pas seulement à celle de la pièce', () => {
    const servi = servedSideContent({ ...ordinaire, message: { isViewOnce: false, isBlurred: false, effectFlags: 0, expiresAt: new Date(), deletedAt: null } });

    expect(servi.transcription).toBeNull();
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
