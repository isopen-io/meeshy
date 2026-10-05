import type { AdminEntityRef } from '@/components/admin/entity-chip';
import { interpretConversationState } from '@/lib/admin/interpret/enums';
import { conversationLabel, guestLabel, personLabel, personSecondary } from '@/lib/admin/interpret/labels';
import type { Interpreted } from '@/lib/admin/interpret/types';
import type { AdminConversationMember, AdminConversationFiche } from '@/lib/api/admin-conversation-fiche';
import type { AdminInstanceParticipant, AdminParticipantKind } from '@/lib/api/admin-conversations';
import type { AdminConversation, AdminConversationParticipant } from '@/lib/api/admin-user-conversations';
import type { AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **CE QU'UNE CONVERSATION ET SES MEMBRES SONT, EN MOTS** (#8876) — la couche
 * pure entre ce que la passerelle sert et ce que les écrans disent : le NOM
 * d'une conversation (jamais `title ?? identifier ?? id`), l'état unique qu'elle
 * porte, les références d'entité que les puces et les liens consomment, les
 * gestes qu'un membre admet, et la conversion vers la forme que la feuille
 * « Configurer » attend.
 *
 * Rien ici ne lit l'horloge ni le réseau : chaque fonction reçoit la langue et
 * rend une valeur, ce qui les rend mesurables sans monter un écran.
 */

type NamedParticipant = {
  readonly kind: AdminParticipantKind;
  readonly displayName: string | null;
  readonly username?: string | null;
};

/** Le NOM d'un membre : un invité se dit « Invité sans nom » s'il n'en a pas, un compte retombe sur son @pseudo. */
export function participantName(participant: NamedParticipant, language: AdminLanguage): string {
  return participant.kind === 'anonymous'
    ? guestLabel(participant.displayName, language)
    : personLabel({ displayName: participant.displayName, username: participant.username ?? null }, language);
}

type NamedConversation = {
  readonly title: string | null;
  readonly type: string;
  readonly memberCount: number;
  readonly participants: readonly AdminInstanceParticipant[];
};

/**
 * Le nom d'une conversation : son titre, sinon les noms de ses membres (le
 * nombre TOTAL est passé, l'aperçu n'en sert que six : « Awa, Jean et 3 autres »).
 */
export function conversationNameOf(conversation: NamedConversation, language: AdminLanguage): string {
  return conversationLabel(
    {
      title: conversation.title,
      type: conversation.type,
      participants: conversation.participants.map((participant) => ({ displayName: participantName(participant, language) })),
      total: conversation.memberCount,
    },
    language,
  );
}

/** Le nom de la fiche : l'aperçu de six membres tient lieu de `participants`, le total vient de `memberCount`. */
export function ficheNameOf(fiche: AdminConversationFiche, language: AdminLanguage): string {
  return conversationNameOf(
    { title: fiche.title, type: fiche.type, memberCount: fiche.memberCount, participants: fiche.participantsPreview },
    language,
  );
}

/**
 * L'état UNIQUE d'une conversation, le plus grave d'abord : fermée à l'écriture
 * > archivée > active. Les deux premiers viennent de deux colonnes distinctes
 * (`closedAt`, `isActive`) et peuvent coexister — on ne dit que le plus fort.
 */
export function conversationStateOf(
  facts: { readonly isActive: boolean; readonly closedAt: string | null },
  language: AdminLanguage,
): Interpreted {
  if (facts.closedAt !== null) return interpretConversationState('closed', language);
  return interpretConversationState(facts.isActive ? 'active' : 'archived', language);
}

/** La conversation comme ENTITÉ nommée — avec son image quand elle en a une, le glyphe du genre sinon. */
export function conversationRefOf(
  conversation: NamedConversation & { readonly id: string; readonly avatar: string | null },
  language: AdminLanguage,
): AdminEntityRef {
  return {
    kind: 'conversation',
    id: conversation.id,
    label: conversationNameOf(conversation, language),
    ...(conversation.avatar === null ? {} : { avatarUrl: conversation.avatar }),
  };
}

/** Un membre de l'aperçu, comme personne nommée (un invité renvoie à sa fiche d'anonyme, un robot à rien). */
export function previewMemberRefOf(participant: AdminInstanceParticipant, language: AdminLanguage): AdminEntityRef {
  const label = participantName(participant, language);
  return {
    kind: participant.kind === 'anonymous' ? 'anonymous' : 'user',
    id: participant.kind === 'anonymous' ? participant.id : (participant.userId ?? participant.id),
    label,
    ...(participant.avatar === null ? {} : { avatarUrl: participant.avatar }),
  };
}

/**
 * Un membre de la liste complète, comme entité : le secondaire est son @pseudo
 * (jamais inventé), la pastille de présence n'est posée que pour un membre actif
 * réellement en ligne — un membre parti n'est ni en ligne ni hors ligne, il n'est
 * plus là.
 */
export function memberRefOf(member: AdminConversationMember, language: AdminLanguage): AdminEntityRef {
  const secondary = member.kind === 'user' ? personSecondary(member.username) : null;
  return {
    kind: member.kind === 'anonymous' ? 'anonymous' : 'user',
    id: member.kind === 'anonymous' ? member.id : (member.userId ?? member.id),
    label: participantName(member, language),
    ...(secondary === null ? {} : { secondary }),
    ...(member.avatar === null ? {} : { avatarUrl: member.avatar }),
    ...(member.isActive && member.isOnline ? { presence: 'online' as const } : {}),
  };
}

export type MemberGestures = {
  /** Le rôle se change : un compte actif, ni créateur, dans une conversation qui a une hiérarchie. */
  readonly canChangeRole: boolean;
  /** Le retrait se fait : un compte actif, ni créateur, hors conversation globale. */
  readonly canRemove: boolean;
  /** Le créateur est protégé : l'écran le DIT au lieu de griser deux contrôles sans explication. */
  readonly creatorProtected: boolean;
};

/**
 * Les gestes qu'un membre admet — chacun n'est dessiné que s'il a un effet
 * servi (loi 4) : la passerelle refuse le rôle ou le retrait du créateur (403),
 * le retrait dans la conversation globale, et les deux routes se disent en
 * `:userId` — un invité anonyme ou un robot n'a pas de compte, donc aucun geste.
 * Un direct n'a pas de hiérarchie : on n'y règle pas de rôle.
 */
export function memberGestures(member: AdminConversationMember, conversationType: string): MemberGestures {
  const manageable = member.isActive && member.userId !== null && member.kind === 'user';
  const creator = member.role === 'creator';
  return {
    canChangeRole: manageable && !creator && conversationType !== 'direct',
    canRemove: manageable && !creator && conversationType !== 'global',
    creatorProtected: manageable && creator,
  };
}

/**
 * La fiche sous la forme que la feuille « Configurer » attend
 * (`AdminConversationSettingsSheet`, partagée avec la fiche d'un membre). Sans
 * membre administré, `membership` est `null` : la feuille ne propose alors ni le
 * rôle ni le retrait d'un membre, seulement la configuration de la conversation.
 */
export function sheetConversationOf(fiche: AdminConversationFiche): AdminConversation {
  const participants = fiche.participantsPreview.flatMap((participant): readonly AdminConversationParticipant[] =>
    participant.userId === null
      ? []
      : [
          {
            userId: participant.userId,
            displayName: participant.displayName ?? '',
            avatar: participant.avatar,
            role: participant.role,
            joinedAt: participant.joinedAt,
            isActive: true,
          },
        ],
  );

  return {
    id: fiche.id,
    identifier: fiche.identifier,
    title: fiche.title,
    description: fiche.description,
    type: fiche.type,
    avatar: fiche.avatar,
    banner: fiche.banner,
    isActive: fiche.isActive,
    closedAt: fiche.closedAt,
    memberCount: fiche.memberCount,
    messageCount: fiche.messageCount,
    settings: fiche.settings,
    createdAt: fiche.createdAt,
    lastMessageAt: fiche.lastMessageAt,
    participants,
    membership: null,
  };
}
