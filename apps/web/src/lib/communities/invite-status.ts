import type { InviteOutcome } from '@/lib/api/community-invite';
import { translateMembership as t } from '@/lib/i18n-community-membership-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **CE QU'UNE INVITATION A DONNÉ, DIT DANS LA LANGUE DU LECTEUR** (#6376) — une
 * seule phrase pour la feuille « Inviter » et pour la création : combien sont
 * entrés, et si quelqu'un n'a pas pu l'être. Elle ne dit jamais POURQUOI une
 * personne a été refusée (compte inconnu, désactivé, bloqué : la passerelle
 * rend le même 404).
 */
export function inviteStatusOf(language: InterfaceLanguage, outcome: InviteOutcome): string {
  if (outcome.status === 'offline') return t(language, 'community.invite.offline');
  if (outcome.invited === 0) {
    if (outcome.failed > 0) return t(language, 'community.invite.failed');
    return t(language, outcome.already > 0 && outcome.refused === 0 ? 'community.invite.member' : 'community.invite.refused');
  }
  const added = outcome.invited === 1 ? t(language, 'community.invite.done.one') : t(language, 'community.invite.done.other', { count: String(outcome.invited) });
  return outcome.refused + outcome.failed > 0 ? `${added} ${t(language, 'community.invite.partial')}` : added;
}

const handed = new Map<string, string>();

/**
 * La création NAVIGUE vers le détail une fois la communauté créée : la phrase
 * de l'invitation y est remise une fois, puis oubliée — un retour au détail
 * plus tard ne la redit pas.
 */
export function handInviteStatus(communityId: string, status: string): void {
  handed.set(communityId, status);
}

export function takeInviteStatus(communityId: string): string | null {
  const status = handed.get(communityId) ?? null;
  handed.delete(communityId);
  return status;
}
