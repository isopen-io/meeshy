import type { AdminEntityRef } from '@/components/admin/entity-chip';
import type { AdminPersonRef } from '@/lib/api/admin-posts';
import { conversationLabel, personLabel, personSecondary, postLabel } from '@/lib/admin/interpret/labels';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES RÉFÉRENCES D'ENTITÉ DU LOT « CONTENUS »** (#8876) — ce que les puces
 * nomment, partagé par les publications et les communautés.
 *
 * Le libellé est TOUJOURS résolu par la bibliothèque d'interprétation
 * (`personLabel`, `postLabel`, `conversationLabel`) : l'identifiant n'entre dans
 * la référence que pour construire le LIEN, jamais pour se lire. Une entité sans
 * photo n'a pas de clé `avatarUrl` — c'est ce qui fait dessiner au chip le
 * glyphe de son genre plutôt qu'un rond d'initiales.
 */
export function personRef(person: AdminPersonRef | null, language: InterfaceLanguage): AdminEntityRef | null {
  if (person === null) return null;
  return {
    kind: 'user',
    id: person.id,
    label: personLabel(person, language),
    secondary: personSecondary(person.username),
    avatarUrl: person.avatar,
  };
}

export function postRef(
  post: { readonly id: string; readonly type: string | null; readonly author: AdminPersonRef | null },
  language: InterfaceLanguage,
  secondary: string | null = null,
): AdminEntityRef {
  return { kind: 'post', id: post.id, label: postLabel({ type: post.type, author: post.author }, language), secondary };
}

export function communityRef(
  community: { readonly id: string; readonly name: string; readonly identifier: string; readonly avatar: string | null },
  language: InterfaceLanguage,
): AdminEntityRef {
  const name = community.name.trim();
  const identifier = community.identifier.trim();
  return {
    kind: 'community',
    id: community.id,
    label: name === '' ? translateAdmin(language, 'admin.community.unnamed') : name,
    secondary: identifier === '' ? null : identifier,
    ...(community.avatar === null ? {} : { avatarUrl: community.avatar }),
  };
}

export function conversationRef(
  conversation: { readonly id: string; readonly title: string | null; readonly type: string | null },
  language: InterfaceLanguage,
  secondary: string | null,
): AdminEntityRef {
  return {
    kind: 'conversation',
    id: conversation.id,
    label: conversationLabel({ title: conversation.title, type: conversation.type }, language),
    secondary,
  };
}
