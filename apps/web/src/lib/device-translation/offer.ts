import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import type { TranslationEvent } from '@meeshy/shared/types/socketio-events/translation';
import { contentExitLaw } from '@meeshy/shared/utils/content-exit-law';

import type { Message } from '@/lib/api/types';

import type { DeliveredTranslation, OfferedMessage } from './scheduler';

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
 * Le chiffrement de bout en bout n'est pas jugé ici : `OfferedMessage.encrypted`
 * le porte, et chaque consommateur le refuse de son côté.
 */
export const translationMayTravel = (message: Message, viewerId: string): boolean =>
  viewerId !== '' &&
  !isMine(message, viewerId) &&
  (message.deletedAt ?? null) === null &&
  !isBlurred(message) &&
  contentExitLaw(message).nature === 'ordinary';

/**
 * **CE QUE LE FIL CONFIE À L'APPAREIL** (#9898). Un message chiffré de bout en
 * bout n'a pas de clair tant que cet appareil ne l'a pas déchiffré : il part
 * marqué, et ni la traduction ni le partage ne le touchent.
 */
export const offeredMessagesOf = (messages: readonly Message[], viewerId: string): readonly OfferedMessage[] =>
  messages
    .filter((m) => translationMayTravel(m, viewerId))
    .map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      content: m.content,
      originalLanguage: m.originalLanguage,
      translatedLanguages: (m.translations ?? []).map((t) => t.targetLanguage),
      encrypted: m.isEncrypted && m.encryptionMode === 'e2ee',
    }));

/**
 * Une traduction de l'appareil prend la forme d'une traduction serveur et
 * passe par le même puits (`applyMessageTranslation`) : le Prisme la
 * redescend à la peinture, la pastille et la bande de langues la voient,
 * sans qu'aucune peau ne sache d'où elle vient. `translationModel` le dit.
 */
export const translationEventOf = (delivered: DeliveredTranslation): TranslationEvent => {
  const id = `device:${delivered.messageId}:${delivered.target}`;
  return {
    messageId: delivered.messageId,
    translations: [
      {
        id,
        messageId: delivered.messageId,
        sourceLanguage: delivered.source,
        targetLanguage: delivered.target,
        translatedContent: delivered.text,
        translationModel: delivered.engine,
        cacheKey: id,
        cached: true,
      },
    ],
  };
};
