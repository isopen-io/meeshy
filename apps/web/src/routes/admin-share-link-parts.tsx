import { AdminEntityChip } from '@/components/admin/entity-chip';
import { AdminInterpretedBadge } from '@/components/admin/badges';
import { personLabel } from '@/lib/admin/interpret/labels';
import { shareLinkState } from '@/lib/admin/share-link-model';
import { conversationRefOf, userRefOf } from '@/lib/admin/share-link-refs';
import type { AdminShareLinkRow } from '@/lib/api/admin-share-links';
import type { AdminLinkConversation, AdminLinkPerson } from '@/lib/api/admin-share-links-person';
import type { AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **LES PIÈCES COMMUNES DU LOT « LIENS »** (#8876, #6729) — la puce d'une
 * personne, la puce d'une conversation, le badge d'état d'un lien de partage.
 * Partagées par les listes et les fiches des trois sections (liens de partage,
 * liens de suivi, demandes de contact).
 *
 * Une personne ou une conversation absente (compte ou conversation supprimés
 * depuis) ne devient pas une puce : elle se dit en texte simple, parce qu'il n'y a
 * plus de fiche vers laquelle mener — jamais un identifiant à la place du nom.
 */
export function LinkPerson({ language, person }: { readonly language: AdminLanguage; readonly person: AdminLinkPerson | null }) {
  const ref = userRefOf(person, language);
  if (ref === null) return <span>{personLabel(null, language)}</span>;
  return <AdminEntityChip language={language} entity={ref} />;
}

export function LinkConversation({ language, conversation }: { readonly language: AdminLanguage; readonly conversation: AdminLinkConversation | null }) {
  const ref = conversationRefOf(conversation, language);
  if (ref === null) return <span>—</span>;
  return <AdminEntityChip language={language} entity={ref} />;
}

/** L'état d'un lien de partage, nommé : fermé > expiré > quota atteint > actif — l'explication en infobulle. */
export function ShareLinkStateBadge({ language, link, now }: { readonly language: AdminLanguage; readonly link: AdminShareLinkRow; readonly now: Date }) {
  return <AdminInterpretedBadge value={shareLinkState(link, now, language)} />;
}
