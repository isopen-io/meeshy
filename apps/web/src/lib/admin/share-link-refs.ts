import type { AdminEntityRef } from '@/components/admin/entity-chip';
import type { AdminLinkConversation, AdminLinkPerson } from '@/lib/api/admin-share-links-person';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { interpretConversationType } from './interpret/enums';
import { conversationLabel, guestLabel, personLabel, personSecondary } from './interpret/labels';

/**
 * **LES RÉFÉRENCES NOMMÉES DU LOT « LIENS »** (#8876, #6729) — ce que les
 * cellules et les fiches des liens de partage, des liens de suivi et des demandes
 * de contact posent comme puces : le VRAI nom (`personLabel`, `conversationLabel`),
 * jamais l'identifiant, qui ne sert qu'à former le lien vers la fiche.
 *
 * Une personne absente (compte supprimé) ne devient pas une puce : l'appelant
 * dit « Personne inconnue » en texte simple — une puce fabriquée n'aurait aucun
 * identifiant vers lequel mener.
 */
export function userRefOf(person: AdminLinkPerson | null, language: InterfaceLanguage): AdminEntityRef | null {
  if (person === null) return null;
  return {
    kind: 'user',
    id: person.id,
    label: personLabel(person, language),
    secondary: personSecondary(person.username),
    avatarUrl: person.avatar,
  };
}

/** Une conversation : son titre, sinon « Conversation sans titre » ; son TYPE nommé en secondaire (aucun aperçu de membres n'est servi ici). */
export function conversationRefOf(conversation: AdminLinkConversation | null, language: InterfaceLanguage): AdminEntityRef | null {
  if (conversation === null) return null;
  return {
    kind: 'conversation',
    id: conversation.id,
    label: conversationLabel({ title: conversation.title, type: conversation.type }, language),
    secondary: conversation.type === null ? null : interpretConversationType(conversation.type, language).label,
  };
}

/** Un invité arrivé par un lien : son pseudonyme, sinon « Invité sans nom ». */
export function guestRefOf(guest: { readonly id: string; readonly displayName: string | null; readonly avatar: string | null }, language: InterfaceLanguage): AdminEntityRef {
  return { kind: 'anonymous', id: guest.id, label: guestLabel(guest.displayName, language), avatarUrl: guest.avatar };
}
