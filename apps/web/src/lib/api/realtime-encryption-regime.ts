import type { QueryClient } from '@tanstack/react-query';

import type { EncryptionMode } from '@meeshy/shared/types/encryption';
import { sharedTranslationServerReadsMessage } from '@meeshy/shared/utils/shared-translation-eligibility';

import { conversationQueryKey, findCachedConversation, patchConversation, patchConversationDetail } from './conversations';
import type { Conversation } from './types';

/**
 * LE RÉGIME DE CHIFFREMENT VU EN TEMPS RÉEL (#11373) — activer le bout en bout
 * ne publie qu'un AVIS SYSTÈME (`metadata: { kind: 'encryption-enabled', mode }`,
 * `routes/conversation-encryption.ts`) ; aucun évènement ne porte
 * `encryptionMode`. Sans ce module, le cache web gardait « en clair » jusqu'au
 * prochain rechargement : le menu offrait Modifier et Transférer, la bascule
 * des traductions servies, et les envois partaient en clair.
 *
 * L'avis voyage sous trois formes : `systemEvent` (`message:new`),
 * `lastMessageSystemEvent` (`conversation:updated`), `metadata` (le fil lu par
 * REST). Les trois se lisent ici, une fois.
 *
 * FERMÉ PAR DÉFAUT : un mode absent ou inconnu vaut `e2ee`, et un régime déjà
 * fermé ne se rouvre jamais par un avis — seule la relecture du détail
 * (invalidée) peut le dire.
 */

const NOTICE_KIND = 'encryption-enabled';
const NOTICE_KEY = 'system.encryption-enabled';

type AnnouncedMode = NonNullable<EncryptionMode>;

const MODES: readonly AnnouncedMode[] = ['e2ee', 'server', 'hybrid'];

type NoticeSource = {
  readonly messageType?: string | null;
  readonly metadata?: unknown;
  readonly systemEvent?: unknown;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;

const modeOf = (value: unknown): AnnouncedMode => MODES.find((mode) => typeof value === 'string' && value.trim().toLowerCase() === mode) ?? 'e2ee';

function announcedBy(source: NoticeSource): unknown {
  const { metadata, systemEvent } = source;
  if (isRecord(systemEvent) && systemEvent.key === NOTICE_KEY) return isRecord(systemEvent.params) ? systemEvent.params.mode : undefined;
  if (isRecord(metadata) && metadata.kind === NOTICE_KIND) return metadata.mode;
  return null;
}

/** Le mode qu'un avis SYSTÈME annonce, ou `null` — un texte d'utilisateur qui l'imiterait n'annonce rien. */
export function encryptionAnnounced(source: NoticeSource): AnnouncedMode | null {
  if (source.messageType !== 'system') return null;
  const announced = announcedBy(source);
  return announced === null ? null : modeOf(announced);
}

/** Le serveur lit-il une conversation de ce régime ? Inconnu ou bout en bout ⇒ non. */
const readable = (mode: string | null | undefined): boolean =>
  sharedTranslationServerReadsMessage({ conversationEncryptionMode: mode, messageIsEncrypted: false, messageEncryptionMode: null });

/**
 * LE FIL CHARGÉ PAR REST DIT AUSSI LE RÉGIME — l'avis y vit dans `metadata`.
 * Le menu le lit avant de juger : une conversation servie en clair dont le fil
 * porte l'avis est jugée chiffrée tant que le détail ne l'a pas relue. Un
 * régime déjà fermé (ou inconnu) reste tel quel.
 */
export function regimeAfterNotices<M extends string | null | undefined>(current: M, messages: readonly NoticeSource[]): M | AnnouncedMode {
  const notice = readable(current) ? messages.find((message) => encryptionAnnounced(message) !== null) : undefined;
  return (notice === undefined ? null : encryptionAnnounced(notice)) ?? current;
}

const withRegime =
  (announced: AnnouncedMode) =>
  (conversation: Conversation): Conversation =>
    readable(conversation.encryptionMode) && conversation.encryptionMode !== announced ? { ...conversation, encryptionMode: announced } : conversation;

/**
 * POSE L'ANNONCE sur la liste ET le détail (deux caches, la même conversation),
 * puis relit le détail pour la vérité du serveur. Rien ne change (régime déjà
 * fermé ou déjà annoncé) ⇒ rien n'est relu : la même ligne de liste
 * rediffusée ne coûte rien.
 */
export function applyEncryptionAnnounced(queryClient: QueryClient, conversationId: string, announced: AnnouncedMode | null): void {
  if (announced === null) return;
  const close = withRegime(announced);
  const listed = findCachedConversation(queryClient, conversationId);
  const detail = queryClient.getQueryData<Conversation>(conversationQueryKey(conversationId));
  const changes = [listed, detail].some((conversation) => conversation !== undefined && close(conversation) !== conversation);
  if (!changes) return;
  patchConversation(queryClient, conversationId, close);
  patchConversationDetail(queryClient, conversationId, close);
  void queryClient.invalidateQueries({ queryKey: conversationQueryKey(conversationId), exact: true });
}
