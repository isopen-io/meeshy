import {
  loadConversationEncryptionCatalog,
  translateConversationEncryption,
  type ConversationEncryptionCatalogKey,
} from '@/lib/i18n-conversation-encryption-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES MOTS DU PAIR SANS APPAREIL CHIFFRÉ** (#20075) — ceux d'iOS (#20074) :
 * le bandeau au-dessus du composeur (`EndToEndPeerWithoutDeviceBannerRule`),
 * l'avis de l'envoi redirigé (`EndToEndReadableRedirect.notice`) et le refus
 * 409 `E2EE_PARTICIPANT_WITHOUT_DEVICE` (#20073,
 * `EndToEndParticipantWithoutDeviceRefusal`). Le prénom adresse le pair ; sans
 * lui, la phrase ne nomme personne — jamais un autre membre.
 */
type Translate = (key: ConversationEncryptionCatalogKey, params?: Readonly<Record<string, string>>) => string;

type NamedKeys = { readonly named: ConversationEncryptionCatalogKey; readonly anonymous: ConversationEncryptionCatalogKey };

/** Les clés que ces mots lisent (`catalog-conversation-encryption-*.ts`). */
export const PEER_WITHOUT_DEVICE_KEY = {
  title: { named: 'conversationEncryption.peerWithoutDevice.title', anonymous: 'conversationEncryption.peerWithoutDevice.titleAnonymous' },
  writePlain: 'conversationEncryption.peerWithoutDevice.writePlain',
  redirected: { named: 'conversationEncryption.redirectedToReadable', anonymous: 'conversationEncryption.redirectedToReadableAnonymous' },
  refusal: { named: 'conversationEncryption.participantWithoutDevice.named', anonymous: 'conversationEncryption.participantWithoutDevice.anonymous' },
} as const satisfies {
  readonly title: NamedKeys;
  readonly writePlain: ConversationEncryptionCatalogKey;
  readonly redirected: NamedKeys;
  readonly refusal: NamedKeys;
};

export const firstNameOf = (name: string | null | undefined): string => (name ?? '').trim().split(/\s+/u)[0] ?? '';

const named = (t: Translate, name: string, keys: NamedKeys): string => {
  const first = firstNameOf(name);
  return first === '' ? t(keys.anonymous) : t(keys.named, { name: first });
};

export const peerWithoutDeviceTitle = (t: Translate, peerName: string): string =>
  named(t, peerName, PEER_WITHOUT_DEVICE_KEY.title);

export const writePlainLabel = (t: Translate): string => t(PEER_WITHOUT_DEVICE_KEY.writePlain);

export const redirectedToReadableNotice = (t: Translate, peerName: string): string =>
  named(t, peerName, PEER_WITHOUT_DEVICE_KEY.redirected);

/**
 * La bascule nomme les membres en cause (`withoutDeviceUserIds`), la création
 * personne : sans liste, c'est le pair. Un autre membre, ou moi-même : la
 * phrase sans nom.
 */
export function participantWithoutDeviceText(
  t: Translate,
  params: { readonly peerUserId?: string; readonly peerName?: string; readonly withoutDeviceUserIds: readonly string[] },
): string {
  const namesPeer = params.withoutDeviceUserIds.length === 0 || (params.peerUserId !== undefined && params.withoutDeviceUserIds.includes(params.peerUserId));
  return named(t, namesPeer ? (params.peerName ?? '') : '', PEER_WITHOUT_DEVICE_KEY.refusal);
}

/** Le refus d'une création (`creationOutcomeOf`) : la passerelle ne nomme personne, c'est la personne touchée. */
export async function creationRefusalText(language: InterfaceLanguage, peerName: string | null): Promise<string> {
  await loadConversationEncryptionCatalog(language);
  const t: Translate = (key, params) => translateConversationEncryption(language, key, params);
  return participantWithoutDeviceText(t, { peerName: peerName ?? '', withoutDeviceUserIds: [] });
}
