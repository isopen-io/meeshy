/**
 * LA PROTECTION DÉCLARÉE SUR LA PIÈCE JOINTE ELLE-MÊME — cycle 125, #6189.
 *
 * `MessageAttachment` porte ses PROPRES `isViewOnce` / `isBlurred` /
 * `effectFlags`, **indépendants de ceux du message qui la porte**. Le gateway
 * compose depuis toujours le verdict des deux niveaux par un OU
 * (`routes/posts/core.ts` : `protectedPreview(message) !== null ||
 * maskedAttachment(attachment)`), et son commentaire dit pourquoi : « une garde
 * qui ne lisait que la pièce jointe laissait tout cela sortir EN CLAIR ».
 *
 * **Cette loi vivait dans `services/gateway/.../NotificationService.ts`, donc
 * hors de portée des clients** — et `apps/web-v2` ne la lisait nulle part :
 * sonde du 2026-09-12, une pièce `isViewOnce: true` sur un message non protégé
 * rendait son `<img>` et l'URL du fichier en clair (`url_en_clair=true
 * img=true voile=false`), pendant qu'iOS la lit
 * (`apps/ios/.../Focal/Row/FocalAttachmentBlock.swift:130`). Une loi qui
 * gouverne trois clients ne peut pas habiter un service : c'est le § Single
 * Source of Truth, et c'est ce déménagement qui rend la garde web possible.
 *
 * Ne lit PAS `isEncrypted` : le chiffrement d'une pièce jointe est un mode de
 * TRANSPORT (le chemin de téléchargement le dénoue), pas un masque d'affichage.
 * Le message chiffré, lui, est bien retenu — par la quatrième branche de
 * `protectedPreview`, au niveau MESSAGE.
 *
 * `effectFlags` est lu bien qu'il soit, selon
 * `packages/shared/utils/last-message-protection.ts:9-12`, un bitfield
 * RECOMPOSÉ serveur depuis les mêmes colonnes : la redondance est délibérée et
 * fail-closed — une charge qui ne porterait que le bitfield est retenue quand
 * même. Les trois canaux sont donc un OU, jamais une cascade.
 */

import { MESSAGE_EFFECT_FLAGS } from '../types/message-effect-flags';

export interface AttachmentProtectionFlags {
  isViewOnce?: boolean | null;
  isBlurred?: boolean | null;
  effectFlags?: number | null;
}

/**
 * `true` ⇒ la pièce est MASQUÉE : ni son fichier, ni son URL, ni sa vignette ne
 * doivent atteindre un destinataire — bannière, post, ou DOM d'un fil.
 *
 * Une entrée absente rend `false` : c'est le seul défaut sûr ici, parce qu'une
 * pièce sans déclaration est une pièce ordinaire. Le fail-closed de ce domaine
 * vit dans l'appelant, qui doit poser la question pour CHAQUE pièce et non pour
 * la première.
 */
export function maskedAttachment(input: AttachmentProtectionFlags | null | undefined): boolean {
  if (!input) return false;
  const flags = input.effectFlags ?? 0;
  const maskingFlags = MESSAGE_EFFECT_FLAGS.VIEW_ONCE | MESSAGE_EFFECT_FLAGS.BLURRED;
  return input.isViewOnce === true
    || input.isBlurred === true
    || (flags & maskingFlags) !== 0;
}
