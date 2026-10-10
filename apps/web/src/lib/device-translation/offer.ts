import type { TranslationEvent } from '@meeshy/shared/types/socketio-events/translation';

import type { Message } from '@/lib/api/types';

import type { DeliveredTranslation, OfferedMessage } from './scheduler';

/**
 * **CE QUE LE FIL CONFIE À L'APPAREIL** (#9898). Mes propres messages sont
 * écrits dans une langue que je lis. Un message éphémère, à vue unique ou
 * flouté n'entre jamais dans le cache de l'appareil : sa traduction y
 * survivrait à la protection. Un message chiffré de bout en bout n'a pas de
 * clair tant que cet appareil ne l'a pas déchiffré.
 */
export const offeredMessagesOf = (messages: readonly Message[], viewerId: string): readonly OfferedMessage[] =>
  messages
    .filter((m) => m.senderId !== viewerId && !m.isViewOnce && !m.isBlurred && (m.expiresAt ?? null) === null)
    .map((m) => ({
      id: m.id,
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
