/**
 * **UNE TRANSCRIPTION FAITE SUR L'APPAREIL DOIT SE RELIRE** — audit de
 * cohérence iOS ↔ passerelle, 2026-09-11.
 *
 * Le témoin central est le dernier de ce fichier : la sortie passe
 * `parseAttachmentTranscription`, le validateur de la forme CANONIQUE du
 * document `PostMedia.transcription`. C'est ce qui rend la garde falsifiable —
 * remettre la charge du fil telle quelle (ce que faisaient les deux services)
 * la fait échouer, et le message dit exactement quelle clé manque.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { parseAttachmentTranscription } from '@meeshy/shared/utils/attachment-validators';

import { attachmentTranscriptionFromMobile } from '../mobile-transcription';

/** La charge que `MobileTranscriptionSchema` accepte, dans SA graphie. */
const duFil = {
  text: 'On se retrouve à midi devant la gare',
  language: 'fr-FR',
  confidence: 0.92,
  duration_ms: 4200,
  segments: [
    { text: 'On se retrouve à midi', start: 0, end: 1.84 },
    { text: 'devant la gare', start: 1.84, end: 4.2, speaker_id: 'S1' },
  ],
};

describe('attachmentTranscriptionFromMobile — du fil vers le magasin', () => {
  it('convertit les horodatages de segment en millisecondes entières', () => {
    const { segments } = attachmentTranscriptionFromMobile(duFil) as {
      segments: Array<Record<string, unknown>>;
    };
    expect(segments[0]).toMatchObject({ startMs: 0, endMs: 1840 });
    expect(segments[1]).toMatchObject({ startMs: 1840, endMs: 4200 });
  });

  it('renomme ce que le magasin nomme autrement', () => {
    const canonique = attachmentTranscriptionFromMobile(duFil) as Record<string, unknown>;
    expect(canonique.durationMs).toBe(4200);
    expect((canonique.segments as Array<Record<string, unknown>>)[1].speakerId).toBe('S1');
  });

  /**
   * LE TÉMOIN DE LA RÉGRESSION. Les quatre clés du fil ne doivent SURVIVRE
   * nulle part : un document qui porterait les deux graphies laisserait chaque
   * lecteur choisir la sienne, et le prochain correctif porterait sur la
   * mauvaise moitié.
   */
  it('ne laisse aucune clé de la graphie du fil dans le document', () => {
    const canonique = attachmentTranscriptionFromMobile(duFil);
    const aplati = JSON.stringify(canonique);
    for (const clef of ['duration_ms', 'speaker_id', '"start"', '"end"']) {
      expect(aplati).not.toContain(clef);
    }
  });

  it('tient la confiance absente au même repli que le chemin serveur', () => {
    const sansConfiance = attachmentTranscriptionFromMobile({ ...duFil, confidence: undefined });
    expect((sansConfiance as { confidence: number }).confidence).toBe(0);
  });

  it('n’invente pas de moteur : le fil ne dit pas lequel a transcrit', () => {
    expect(attachmentTranscriptionFromMobile(duFil)).not.toHaveProperty('model');
  });

  it('accepte une transcription sans segment — le texte seul reste lisible', () => {
    const nu = attachmentTranscriptionFromMobile({
      text: 'Bonjour', language: 'fr', segments: undefined,
    } as never);
    expect(nu).toMatchObject({ text: 'Bonjour', segments: [], confidence: 0 });
    expect(nu).not.toHaveProperty('durationMs');
  });

  /**
   * LA LOI. Tout le reste de ce fichier décrit des clés ; celui-ci mesure que
   * le document produit est ACCEPTÉ par le validateur que le chemin serveur
   * utilise déjà — donc qu'une transcription mobile et une transcription
   * Whisper sont, pour tout lecteur, le même genre d'objet.
   */
  it('produit un document que le validateur canonique accepte', () => {
    const verdict = parseAttachmentTranscription(attachmentTranscriptionFromMobile(duFil));
    expect(verdict.ok).toBe(true);
  });

  /**
   * ET LA CONTRE-ÉPREUVE : la charge du fil, telle quelle, ne l'est pas. C'est
   * littéralement ce que les deux services persistaient.
   */
  it('la charge du fil persistée verbatim, elle, est refusée', () => {
    const verdict = parseAttachmentTranscription({ ...duFil, source: 'mobile' });
    expect(verdict.ok).toBe(false);
  });
});
