import { createContext, useContext } from 'react';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';

import type { Attachment } from '@/lib/api/types';

/**
 * L'OUVERTURE D'UNE VUE UNIQUE EST LE DROIT DE VOIR SES PIÈCES (#7672).
 *
 * La passerelle pose `isViewOnce` sur les pièces d'un message à vue unique
 * (#7498), et `maskedAttachment` les remplace par « Photo protégée » partout.
 * Hors de l'ouverture, c'est juste : rien du contenu ne s'affiche avant le
 * toucher. Dans le plein écran que le lecteur vient d'ouvrir, c'était le
 * contraire de ce qu'il demandait. `ViewOnceStage` pose donc ce contexte, et
 * les blocs de pièces y lèvent le SEUL masque de vue unique ; un flou reste un
 * flou.
 */
export const ViewOnceOpenedContext = createContext(false);

type ProtectedAttachment = Attachment & { readonly effectFlags?: number };

const withoutViewOnce = (attachment: ProtectedAttachment): ProtectedAttachment => {
  const flags = attachment.effectFlags;
  return {
    ...attachment,
    isViewOnce: false,
    ...(typeof flags === 'number' ? { effectFlags: flags & ~MESSAGE_EFFECT_FLAGS.VIEW_ONCE } : {}),
  };
};

export function useAttachmentMasked(): (attachment: Attachment) => boolean {
  const opened = useContext(ViewOnceOpenedContext);
  return opened ? (attachment) => maskedAttachment(withoutViewOnce(attachment)) : maskedAttachment;
}

/**
 * LE MÉDIA QUE LE LECTEUR VIENT DE TOUCHER, EN CLAIR (#8008).
 *
 * Toucher une pièce floutée ou à vue unique OUVRE la visionneuse sur elle :
 * c'est la seule surface où son fichier a le droit d'entrer dans le document.
 * La pièce remise à la visionneuse perd ses TROIS canaux de masque —
 * `isViewOnce`, `isBlurred` et les bits masquants d'`effectFlags`, l'inventaire
 * de `maskedAttachment` —, et elle seule : ses voisines gardent les leurs.
 */
export function revealedAttachment(attachment: ProtectedAttachment): ProtectedAttachment {
  const flags = attachment.effectFlags;
  const masking = MESSAGE_EFFECT_FLAGS.VIEW_ONCE | MESSAGE_EFFECT_FLAGS.BLURRED;
  return {
    ...attachment,
    isViewOnce: false,
    isBlurred: false,
    ...(typeof flags === 'number' ? { effectFlags: flags & ~masking } : {}),
  };
}

/**
 * LA PROTECTION D'UN MESSAGE, PORTÉE SUR SES PIÈCES (#8008) — ce que la
 * passerelle écrit déjà à la liaison (#7498, `associateAttachmentsToMessage`),
 * rejoué côté client pour une charge qui ne le porterait pas encore (cache
 * ancien, envoi optimiste). Une pièce d'un message voilé se rend donc TOUJOURS
 * par son substitut, jamais par son fichier.
 */
export function veiledAttachment(attachment: ProtectedAttachment): ProtectedAttachment {
  return { ...attachment, isBlurred: true };
}
