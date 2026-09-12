/**
 * LA LOI DE PROTECTION D'UNE PIÈCE JOINTE, À SON DOMICILE (#6189).
 *
 * Elle vivait dans `services/gateway/.../NotificationService.ts` — donc hors de
 * portée des clients, et `apps/web-v2` ne la lisait nulle part : une pièce
 * `isViewOnce: true` sur un message ordinaire rendait son `<img>` et l'URL du
 * fichier en clair, pendant qu'iOS la retenait
 * (`apps/ios/.../FocalAttachmentBlock.swift:130`). Ce n'était pas un oubli de
 * câblage : c'était le DOMICILE qui rendait la garde web impossible à écrire.
 *
 * Ses témoins la suivent donc ici. Le gateway en garde ses propres (les routes
 * qui la consomment) ; ceux-ci gardent la LOI, pas ses usages.
 */

import { describe, expect, it } from 'vitest';

import { MESSAGE_EFFECT_FLAGS } from '../types/message-effect-flags';
import { maskedAttachment } from '../utils/attachment-protection';

describe('maskedAttachment — les trois canaux sont un OU, jamais une cascade', () => {
  it('masque sur isViewOnce seul', () => {
    expect(maskedAttachment({ isViewOnce: true })).toBe(true);
  });

  it('masque sur isBlurred seul', () => {
    expect(maskedAttachment({ isBlurred: true })).toBe(true);
  });

  it('masque sur le BITMASK seul — le canal qu’un témoin « à vue » ne couvrirait pas', () => {
    // Un entier ne ressemble pas à une protection : c'est pourquoi il se teste.
    expect(maskedAttachment({ effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE })).toBe(true);
    expect(maskedAttachment({ effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED })).toBe(true);
  });

  it('masque quand le bitmask porte AUSSI d’autres bits — c’est un masque, pas une égalité', () => {
    const flags = MESSAGE_EFFECT_FLAGS.VIEW_ONCE | MESSAGE_EFFECT_FLAGS.CONFETTI | MESSAGE_EFFECT_FLAGS.GLOW;

    expect(maskedAttachment({ effectFlags: flags })).toBe(true);
  });
});

describe('maskedAttachment — ce qu’elle NE masque PAS, et pourquoi', () => {
  /**
   * L'ÉPHÉMÈRE SE JUGE AU NIVEAU MESSAGE, sur son horloge. Une loi écrite
   * `effectFlags !== 0` passerait tous les témoins ci-dessus et retiendrait le
   * média de tout message éphémère ENCORE VALIDE — un défaut qui ne se verrait
   * que sur les fils où l'éphémère est actif.
   */
  it('ne masque PAS sur le bit EPHEMERAL : l’éphémère appartient au niveau MESSAGE', () => {
    expect(maskedAttachment({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL })).toBe(false);
  });

  /**
   * Le chiffrement d'une pièce est un mode de TRANSPORT — le chemin de
   * téléchargement le dénoue — pas un masque d'affichage. Le message chiffré,
   * lui, est bien retenu, par `protectedPreview` au niveau message.
   */
  it('ne lit pas isEncrypted : un champ inconnu ne masque rien', () => {
    expect(maskedAttachment({ isEncrypted: true } as never)).toBe(false);
  });

  it('une pièce SANS déclaration n’est pas masquée — le défaut sûr, une pièce ordinaire', () => {
    expect(maskedAttachment({})).toBe(false);
    expect(maskedAttachment({ isViewOnce: false, isBlurred: false, effectFlags: 0 })).toBe(false);
  });

  /**
   * `null` / `undefined` rendent `false`, et c'est délibéré : l'appelant doit
   * poser la question pour CHAQUE pièce. Le fail-closed de ce domaine vit chez
   * lui — `Attachments` (web) interroge la pièce courante dans son `map`, jamais
   * la première ni un `some()`.
   */
  it('null et undefined rendent false — le fail-closed vit chez l’appelant', () => {
    expect(maskedAttachment(null)).toBe(false);
    expect(maskedAttachment(undefined)).toBe(false);
  });

  it('un booléen FAUX ne masque pas, et une valeur non-true non plus', () => {
    // La loi teste `=== true`, donc une charge non décodée ne masque pas par
    // accident — c'est `protectedPreview` qui garde le message, et le décodeur
    // qui garde la forme.
    expect(maskedAttachment({ isViewOnce: null })).toBe(false);
    expect(maskedAttachment({ effectFlags: null })).toBe(false);
  });
});
