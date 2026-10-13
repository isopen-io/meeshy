/**
 * L'ORDRE UNIQUE des causes de fin d'accès d'un invité de lien (#10457).
 *
 * Quatre portes jugent le même invité : la connexion socket
 * (`AuthHandler._authenticateAnonymousUser`), le REST (`middleware/auth.ts`),
 * la relecture du minuteur (`socketio/handlers/guestLinkWatch.ts`) et le
 * rafraîchissement de session (`routes/conversations/guest-sessions.ts`).
 * Elles disaient la même chose dans un ordre différent : la connexion et le
 * REST jugeaient la participation d'abord, la relecture le lien d'abord, et le
 * même invité lisait « accès retiré » ou « lien expiré » selon le chemin.
 *
 * Le lien expiré passe d'abord : c'est la cause première quand le balayage
 * désactive les invités d'un lien échu. Puis la participation morte —
 * désactivée, bannie, ou introuvable à la relecture —, par la règle de
 * `PARTICIPATION_VIVANTE`.
 *
 * Pure : chaque porte lit d'abord TOUT ce qu'il faut, puis décide. Une lecture
 * qui échoue n'arrive jamais ici — elle lève chez la porte, qui coupe SANS
 * code de fin d'accès (un accroc de la base ne coûte pas sa session à
 * l'invité).
 */
import { participationEstVivante } from '../routes/conversations/utils/access-control';
import { shareLinkHasExpired } from './shareLinkReadGate';

export type GuestAccessEnd = 'link-expired' | 'revoked' | null;

export type GuestAccessState = {
  /** L'échéance du lien de l'invité — `null` sans lien, sans échéance, ou lien introuvable. */
  readonly linkExpiresAt: Date | null;
  /**
   * #10470 — la révocation DIFFÉRÉE d'un gros lien fermé : en attente depuis
   * cet instant. Tout invité entré avant (ou à) cet instant n'a plus accès,
   * même tant que sa ligne n'est pas encore écrite inactive.
   */
  readonly linkRevocationPendingAt?: Date | null;
  /**
   * #10470 — un lien FERMÉ (`false`) ne donne plus accès à aucun invité :
   * toute fermeture révoque ses invités, et une réouverture ne ranime jamais
   * une ligne. Lu ici, il ferme la course d'une admission réservée avant la
   * fermeture et créée après la marque. `null`/absent : lien introuvable ou
   * non lu, rien n'est décidé.
   */
  readonly linkIsActive?: boolean | null;
  /** La ligne de l'invité — `null` quand elle n'existe plus. */
  readonly participation: {
    readonly isActive?: boolean | null;
    readonly bannedAt?: Date | null;
    readonly joinedAt?: Date | null;
  } | null;
  readonly now: Date;
};

export function guestAccessEnd(state: GuestAccessState): GuestAccessEnd {
  if (shareLinkHasExpired({ expiresAt: state.linkExpiresAt }, state.now)) return 'link-expired';
  if (!state.participation || !participationEstVivante(state.participation)) return 'revoked';
  if (state.linkIsActive === false) return 'revoked';
  if (admittedBeforePendingRevocation(state.participation.joinedAt, state.linkRevocationPendingAt)) return 'revoked';
  return null;
}

/** Une date d'entrée inconnue sous une marque posée vaut « entré avant » : fail-closed. */
function admittedBeforePendingRevocation(joinedAt: Date | null | undefined, pendingAt: Date | null | undefined): boolean {
  if (!pendingAt) return false;
  if (!joinedAt) return true;
  return new Date(joinedAt).getTime() <= new Date(pendingAt).getTime();
}
