import type { AttachmentTranslations } from '@meeshy/shared/types/attachment-audio';

import { sharedTranslationServerReadsMessage } from '@meeshy/shared/utils/shared-translation-eligibility';

import type { Attachment, Message } from '@/lib/api/types';

/**
 * CE QUE LE LECTEUR AUDIO PLEIN ÉCRAN A OBTENU À LA DEMANDE (#9256) — miroir
 * de `localTranscription` / `extraTranslatedAudios` d'`AudioFullscreenView`
 * iOS : une transcription demandée au serveur, des versions traduites
 * demandées depuis le lecteur.
 *
 * Elles se GREFFENT sur la pièce avant la descente du Prisme (`electAudio`),
 * jamais à côté : le texte servi et la piste jouée restent les deux moitiés
 * d'une SEULE élection. Ce que la passerelle a servi gagne toujours — une
 * pièce enrichie par le temps réel (`message:attachment-updated`) rend
 * l'obtenu local inutile, sans jamais être recouverte par lui.
 */
export type SuppliedAudio = {
  readonly transcription: NonNullable<Attachment['transcription']> | null;
  readonly translations: AttachmentTranslations;
};

export const NOTHING_SUPPLIED: SuppliedAudio = { transcription: null, translations: {} };

export function withSupplied(attachment: Attachment, supplied: SuppliedAudio): Attachment {
  const transcription = attachment.transcription ?? supplied.transcription;
  const addsTranscription = attachment.transcription == null && transcription !== null;
  const addsTranslations = Object.keys(supplied.translations).some((code) => attachment.translations?.[code] === undefined);
  if (!addsTranscription && !addsTranslations) return attachment;
  return {
    ...attachment,
    ...(transcription !== null ? { transcription } : {}),
    translations: { ...supplied.translations, ...(attachment.translations ?? {}) },
  };
}

/**
 * LES LANGUES QU'ON PEUT DEMANDER — celles du lecteur d'abord, dans l'ordre de
 * son prisme, puis les langues courantes du produit ; jamais une langue dont
 * une version existe déjà (on l'ÉCOUTE depuis la rangée des langues), jamais
 * une cible vide.
 */
const COMMON_TARGETS: readonly string[] = ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar', 'sw'];

export function translationOffers({ readerLanguages, versions }: { readonly readerLanguages: readonly string[]; readonly versions: readonly string[] }): readonly string[] {
  const available = new Set(versions);
  return [...new Set([...readerLanguages, ...COMMON_TARGETS])].filter((code) => code.trim().length >= 2 && !available.has(code));
}

/**
 * « TRANSCRIRE » N'EST OFFERT QUE SI LE SERVEUR PEUT LIRE LE VOCAL (#10700) —
 * loi 4 : un contrôle existe s'il a un effet. La passerelle refuse la demande
 * pour un message qu'elle ne lit pas (bout en bout) et n'en connaît ni
 * l'identifiant ni la pièce tant que l'envoi est local (`cid_…`, aperçu
 * `blob:`) : le geste serait voué au refus. Un hôte qui ne connaît pas le
 * message (aucun) garde l'offre, comme avant.
 */
export function transcriptionOffered(params: {
  readonly attachment: Pick<Attachment, 'id' | 'fileUrl'>;
  readonly message?: Pick<Message, 'id' | 'isEncrypted' | 'encryptionMode'> | undefined;
  readonly conversationEncryptionMode?: string | null | undefined;
}): boolean {
  const { attachment, message } = params;
  if (attachment.id === '' || attachment.id.startsWith('cid_') || attachment.fileUrl.startsWith('blob:')) return false;
  if (message === undefined) return true;
  if (message.id.startsWith('cid_')) return false;
  return sharedTranslationServerReadsMessage({
    conversationEncryptionMode: params.conversationEncryptionMode,
    messageIsEncrypted: message.isEncrypted,
    messageEncryptionMode: message.encryptionMode,
  });
}
