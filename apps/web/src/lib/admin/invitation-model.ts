import type { AdminInvitationDay } from '@/lib/api/admin-invitations';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { interpretInvitationStatus } from './interpret/enums';
import { adminDayLabel } from './interpret/time';

/**
 * **CE QU'UNE DEMANDE DE CONTACT PERMET, ET COMMENT SA COURBE SE LIT** (#8876,
 * #6729) — des fonctions pures, sans écran.
 *
 * Seule une demande EN ATTENTE s'annule : annuler une demande déjà acceptée ou
 * refusée ne changerait rien de ce que les deux membres vivent (l'amitié existe ou
 * n'existe pas) — le geste n'est donc pas dessiné pour elle, il n'aurait pas
 * d'effet (loi 4). Le statut se compare sans tenir compte de la casse, comme la
 * bibliothèque d'interprétation qui le nomme.
 */
export const isPendingInvitation = (status: string): boolean => status.trim().toLowerCase() === 'pending';

export type InvitationPoint = { readonly x: string; readonly value: number };

export type InvitationSeries = {
  readonly sent: readonly InvitationPoint[];
  readonly accepted: readonly InvitationPoint[];
  readonly rejected: readonly InvitationPoint[];
  /** Le jour où il s'est envoyé le plus de demandes — `null` quand aucune n'est partie sur la période. */
  readonly peak: { readonly day: string; readonly sent: number } | null;
};

/**
 * Les trois séries de la courbe, à leurs JOURS UTC RÉELS (`AAAA-MM-JJ`) nommés dans
 * la langue d'interface. « Envoyées » compte toutes les demandes créées ce jour-là,
 * « acceptées » et « refusées » sont des sous-ensembles de celles-ci — c'est la
 * définition de la passerelle, pas une répartition qui s'additionne.
 */
export function invitationSeries(days: readonly AdminInvitationDay[], language: AdminLanguage): InvitationSeries {
  const labelled = days.map((day) => ({ ...day, label: adminDayLabel(day.date, language) }));
  const point = (pick: (day: AdminInvitationDay) => number) => labelled.map((day) => ({ x: day.label, value: pick(day) }));

  const top = labelled.reduce<(typeof labelled)[number] | null>((best, day) => (best === null || day.sent > best.sent ? day : best), null);

  return {
    sent: point((day) => day.sent),
    accepted: point((day) => day.accepted),
    rejected: point((day) => day.rejected),
    peak: top === null || top.sent === 0 ? null : { day: top.label, sent: top.sent },
  };
}

/**
 * Ce que le statut VEUT DIRE, en une phrase : « en attente » et « acceptée » ne
 * sont pas évidents pour qui ne connaît pas le flux (la demande attend une
 * réponse ; les deux membres sont amis) ; « refusée » porte déjà son explication
 * dans la bibliothèque d'interprétation (refusée par le destinataire OU annulée
 * par un administrateur). Un statut inconnu n'explique rien.
 */
export function invitationStatusExplain(status: string, language: AdminLanguage): string | null {
  switch (status.trim().toLowerCase()) {
    case 'pending':
      return translateAdmin(language, 'admin.invitation.explain.pending');
    case 'accepted':
      return translateAdmin(language, 'admin.invitation.explain.accepted');
    default:
      return interpretInvitationStatus(status, language).explain;
  }
}
