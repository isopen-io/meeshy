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
  /** La ligne de l'invité — `null` quand elle n'existe plus. */
  readonly participation: { readonly isActive?: boolean | null; readonly bannedAt?: Date | null } | null;
  readonly now: Date;
};

export function guestAccessEnd(state: GuestAccessState): GuestAccessEnd {
  if (shareLinkHasExpired({ expiresAt: state.linkExpiresAt }, state.now)) return 'link-expired';
  if (!state.participation || !participationEstVivante(state.participation)) return 'revoked';
  return null;
}
