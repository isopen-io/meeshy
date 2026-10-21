import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { contentExitLaw } from '@meeshy/shared/utils/content-exit-law';

import type { Message } from '@/lib/api/types';

const isMine = (message: Message, viewerId: string): boolean => message.senderId === viewerId || message.sender?.userId === viewerId;

const isBlurred = (message: Message): boolean => message.isBlurred || ((message.effectFlags ?? 0) & MESSAGE_EFFECT_FLAGS.BLURRED) !== 0;

/**
 * **QUELS MESSAGES LA TRADUCTION DE L'APPAREIL A LE DROIT DE TOUCHER** (#9898,
 * #9899). Mes propres messages sont écrits dans une langue que je lis. Tout ce
 * que la loi de sortie ne laisse pas sortir de Meeshy — vue unique, flamme à
 * durée ou après lecture, éphémère, jugé sur le message ENTIER pièces
 * comprises — n'entre ni dans le cache de l'appareil ni dans le partage aux
 * autres membres : une traduction qu'on garde survit à la protection du
 * message qu'elle traduit. Il en va de même d'un message flouté (colonne ou
 * bit) et d'un message supprimé.
 *
 * Sans lecteur identifié, on ne sait pas lesquels sont les miens : rien ne part.
 * Ce que le serveur lit n'est pas jugé ici : `offeredMessagesOf` le porte, par
 * `OfferedMessage.encrypted` et `OfferedMessage.shareable`, et chaque
 * consommateur refuse de son côté ce qui le concerne.
 */
export const translationMayTravel = (message: Message, viewerId: string): boolean =>
  viewerId !== '' &&
  !isMine(message, viewerId) &&
  (message.deletedAt ?? null) === null &&
  !isBlurred(message) &&
  contentExitLaw(message).nature === 'ordinary';
