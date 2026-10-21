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

/**
 * #10492 (R4) — la marque d'une révocation différée est datée par l'instance
 * qui FERME le lien, `Participant.joinedAt` par celle qui ADMET l'invité
 * (`@default(now())` : l'horloge du moteur Prisma, donc de la passerelle,
 * jamais celle de la base — dater la seule marque par la base ne mettrait pas
 * les deux dates sur la même horloge). Deux passerelles dont les horloges
 * dérivent peuvent donc donner à un invité entré AVANT la fermeture une date
 * d'entrée postérieure à la marque.
 *
 * La marge tient pour « entré avant » tout invité daté jusqu'à dix secondes
 * après la marque : elle couvre une dérive de dix secondes entre instances.
 * Son prix est fail-closed : un invité entré dans les dix secondes qui suivent
 * la fermeture d'un lien ROUVERT aussitôt est retiré avec les autres, et
 * rentre par le lien. Un lien resté fermé ne dépend pas d'elle
 * (`linkIsActive`).
 */
export const GUEST_ADMISSION_CLOCK_MARGIN_MS = 10_000;

/** Le dernier instant d'entrée qu'une révocation en attente depuis `pendingAt` retire. */
export function pendingRevocationAdmissionCutoff(pendingAt: Date): Date {
  return new Date(new Date(pendingAt).getTime() + GUEST_ADMISSION_CLOCK_MARGIN_MS);
}

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
  /**
   * #10492 (R5) — l'invité porte un lien dont la LIGNE n'existe plus. Toute
   * suppression de lien révoque ses invités ; celui qui lui survit (purge
   * interrompue, admission en vol) n'a plus de lien qui l'autorise. Absent ou
   * `false` : invité sans lien, ou lien trouvé.
   */
  readonly linkMissing?: boolean;
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
  if (state.linkIsActive === false || state.linkMissing === true) return 'revoked';
  if (admittedBeforePendingRevocation(state.participation.joinedAt, state.linkRevocationPendingAt)) return 'revoked';
  return null;
}

/**
 * Une date d'entrée inconnue sous une marque posée vaut « entré avant », et
 * une date dans la marge d'horloge aussi : fail-closed.
 */
function admittedBeforePendingRevocation(joinedAt: Date | null | undefined, pendingAt: Date | null | undefined): boolean {
  if (!pendingAt) return false;
  if (!joinedAt) return true;
  return new Date(joinedAt).getTime() <= pendingRevocationAdmissionCutoff(pendingAt).getTime();
}
