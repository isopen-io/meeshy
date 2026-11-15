import type { TranslationEvent } from '@meeshy/shared/types/socketio-events/translation';
import { sharedTranslationServerReadsMessage, sharedTranslationSourceVersion } from '@meeshy/shared/utils/shared-translation-eligibility';

import type { Message } from '@/lib/api/types';

import { translationMayTravel } from './may-travel';
import type { DeliveredTranslation, OfferedMessage } from './scheduler';

const offeredMessageOf = (m: Message, conversationEncryptionMode: string | null): OfferedMessage => {
  const serverReads = sharedTranslationServerReadsMessage({
    conversationEncryptionMode,
    messageIsEncrypted: m.isEncrypted,
    messageEncryptionMode: m.encryptionMode,
  });
  return {
    id: m.id,
    conversationId: m.conversationId,
    content: m.content,
    originalLanguage: m.originalLanguage,
    translatedLanguages: (m.translations ?? []).map((t) => t.targetLanguage),
    encrypted: m.isEncrypted === true && !serverReads,
    shareable: serverReads,
    sourceVersion: sharedTranslationSourceVersion(m.editedAt),
  };
};

/**
 * **CE QUE LE FIL CONFIE À L'APPAREIL** (#9898, #9899). Deux marques, deux
 * questions, toutes deux jugées par la loi partagée
 * (`sharedTranslationServerReadsMessage`, sur le mode de la CONVERSATION et celui
 * du message) :
 *
 * - `encrypted` — y a-t-il un clair sur cet appareil ? Le web ne déchiffre pas le
 *   bout en bout : un message chiffré que le serveur ne lit pas n'a pas de clair
 *   ici, et ni la traduction ni le partage ne le touchent. Un mode absent ou
 *   inconnu sur un message chiffré se lit comme chiffré — on ne devine pas un clair ;
 * - `shareable` — le serveur lit-il déjà ce texte ? La clé du partage dérive du
 *   texte du message : elle n'est admise que là où le serveur le détient déjà.
 *   Un clair que le serveur ne lit pas (un message marqué de bout en bout mais
 *   servi en clair, une conversation chiffrée de bout en bout ou de mode inconnu)
 *   se traduit sur l'appareil, et y reste : il ne se partage ni ne se demande.
 *
 * `sourceVersion` dit quel état du texte l'appareil traduit : le serveur refuse
 * (409) la traduction d'un message modifié depuis.
 * `conversationEncryptionMode` est `null` quand la conversation ne le dit pas :
 * le message tranche alors seul.
 */
export const offeredMessagesOf = (
  messages: readonly Message[],
  viewerId: string,
  conversationEncryptionMode: string | null,
): readonly OfferedMessage[] =>
  messages.filter((m) => translationMayTravel(m, viewerId)).map((m) => offeredMessageOf(m, conversationEncryptionMode));

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
