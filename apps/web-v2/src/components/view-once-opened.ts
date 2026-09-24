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

type ProtectedAttachment = Attachment & { readonly isViewOnce?: boolean; readonly effectFlags?: number };

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
