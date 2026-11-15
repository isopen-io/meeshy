import { JOIN_NOTICE_KIND, type JoinNoticeMetadata, type JoinNoticeLinkRules } from '@meeshy/shared/utils/join-notice';
import type { NoticeActor } from '@meeshy/shared/utils/conversation-notice';
import { postSystemNotice, type SystemNoticeDeps } from './conversationNotice';

/**
 * Discriminant du message système d'arrivée — DÉFINI DANS `@meeshy/shared`
 * (`utils/join-notice.ts`), pas ici : le gateway l'écrit, le web et iOS le
 * lisent, un jumeau local dériverait en silence. Ré-exporté pour les appelants
 * du gateway.
 */
export { JOIN_NOTICE_KIND as JOIN_SYSTEM_MESSAGE_KIND } from '@meeshy/shared/utils/join-notice';
export type { JoinNoticeMetadata as JoinSystemMessageMetadata } from '@meeshy/shared/utils/join-notice';

export type JoinSystemMessageInput = {
  readonly conversationId: string;
  /** `Participant.id` de l'arrivant — il est l'AUTEUR de son propre avis d'arrivée. */
  readonly participantId: string;
  readonly displayName: string;
  readonly isAnonymous: boolean;
  readonly viaShareLink: boolean;
  /** Pseudo stable (`ano_…` pour un visiteur sans compte). */
  readonly username?: string;
  /** Nom humain donné au formulaire d'entrée (prénom/nom), s'il existe. */
  readonly givenName?: string;
  /** Règles du lien emprunté — seules les portes `viaShareLink` les fournissent. */
  readonly linkRules?: JoinNoticeLinkRules;
  /**
   * Le membre qui a fait entrer l'arrivant (#7593) — ajout ou invitation par un
   * tiers. La ligne de liste dit alors « Demo a ajouté X » au lieu de « X a
   * rejoint ». Absent pour une arrivée de soi-même (lien, conversation globale).
   */
  readonly addedBy?: NoticeActor;
};

/**
 * `conversation` s'ajoute à `message` depuis #5914 : l'avis d'arrivée DEVIENT le
 * dernier message du fil, il doit donc avancer son horloge. Écriture, horloge et
 * diffusion passent par `postSystemNotice`, commun à tous les avis de vie du
 * groupe (#7593).
 */
export type JoinSystemMessageDeps = SystemNoticeDeps;

/**
 * Repli TEXTE, jamais la vérité affichée : les clients rendent depuis
 * `metadata` dans la langue du lecteur (Prisme Linguistique). Ce texte sert aux
 * surfaces qui n'ont pas de rendu dédié — aperçu de liste, notification,
 * export — et aux clients plus anciens que ce `kind`.
 */
function fallbackContent(input: JoinSystemMessageInput): string {
  if (input.addedBy) return `${input.addedBy.displayName} a ajouté ${input.displayName}`;
  return input.isAnonymous
    ? `${input.displayName} a rejoint la conversation — visiteur sans compte`
    : `${input.displayName} a rejoint la conversation`;
}

/**
 * Annonce une arrivée dans le fil, quelle que soit la porte empruntée.
 *
 * **Ne rejette jamais.** L'avis est un accessoire de l'entrée, pas sa
 * condition : renvoyer une erreur à un anonyme déjà admis le laisserait sans
 * recours — ce lien est sa seule identité et sa seule porte. Une panne se solde
 * par un `null` et une ligne de log, jamais par un join refusé.
 *
 * L'avis reste attribué à l'ARRIVANT, même ajouté par un tiers : les couloirs
 * du fil (`river-lanes.ts`) et la réparation des expéditeurs orphelins
 * (`repairOrphanedMessageSenders`) en dépendent. L'acteur voyage dans
 * `metadata.addedBy`.
 */
export async function postJoinSystemMessage(
  deps: JoinSystemMessageDeps,
  input: JoinSystemMessageInput
): Promise<unknown | null> {
  const metadata: JoinNoticeMetadata = {
    kind: JOIN_NOTICE_KIND,
    participantId: input.participantId,
    displayName: input.displayName,
    isAnonymous: input.isAnonymous,
    viaShareLink: input.viaShareLink,
    // Clés ABSENTES (jamais null) quand la porte ne les fournit pas : un
    // membre ajouté n'a pas de lien, un inscrit n'a pas de pseudo `ano_`.
    ...(input.username ? { username: input.username } : {}),
    ...(input.givenName ? { givenName: input.givenName } : {}),
    ...(input.linkRules ? { linkRules: input.linkRules } : {}),
    ...(input.addedBy ? { addedBy: input.addedBy } : {}),
  };

  return postSystemNotice(deps, {
    conversationId: input.conversationId,
    senderParticipantId: input.participantId,
    content: fallbackContent(input),
    metadata,
  });
}
