/**
 * Le parrainage — l'entonnoir et les invitations envoyées (#19207, chantier #18857).
 *
 * La vue Parrainage de la planche lit « Visites → Inscriptions → Actifs », « N inscrits ce
 * mois », et la liste des invitations envoyées par e-mail, chacune avec son adresse MASQUÉE,
 * son état et un bouton Relancer. Les règles qui décident de ces chiffres vivent ici, et
 * nulle part ailleurs : la passerelle les applique, les clients les affichent.
 *
 * - Un filleul est ACTIF s'il a été vu sur Meeshy dans les trente derniers jours ; la date
 *   elle-même ne quitte jamais le serveur.
 * - L'adresse d'un invité est un tiers : elle ne part sur le fil que masquée, deux lettres du
 *   nom au plus, cinq points médians quelle que soit sa longueur, puis le domaine.
 * - L'ouverture se lit sur le jeton dédié de l'invitation (une visite de son lien), jamais
 *   par un pixel de suivi.
 * - Une relance attend 72 h après le dernier envoi, et une invitation n'en reçoit que trois.
 */

export const REFERRAL_ACTIVE_WINDOW_DAYS = 30;

export const INVITATION_RESEND_INTERVAL_HOURS = 72;

export const INVITATION_MAX_RESENDS = 3;

export type InvitationState = 'sent' | 'opened' | 'joined';

export type InvitationResendWindow = {
  readonly canResend: boolean;
  readonly resendsLeft: number;
  readonly nextResendAt: Date | null;
};

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MASK = '•••••';

export function maskEmailAddress(email: string): string {
  const at = email.lastIndexOf('@');
  const local = at > 0 ? email.slice(0, at) : '';
  const domain = at > 0 ? email.slice(at + 1).toLowerCase() : '';
  if (local.length === 0 || domain.length === 0) return MASK;
  const kept = local.slice(0, local.length > 2 ? 2 : 1).toLowerCase();
  return `${kept}${MASK}@${domain}`;
}

export function isReferralActive(input: { readonly lastActiveAt: Date | null; readonly now: Date }): boolean {
  if (!input.lastActiveAt) return false;
  return input.now.getTime() - input.lastActiveAt.getTime() <= REFERRAL_ACTIVE_WINDOW_DAYS * DAY_MS;
}

export const referralActiveSince = (now: Date): Date => new Date(now.getTime() - REFERRAL_ACTIVE_WINDOW_DAYS * DAY_MS);

export const utcMonthStart = (now: Date): Date => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

export function invitationState(input: { readonly joined: boolean; readonly opened: boolean }): InvitationState {
  if (input.joined) return 'joined';
  return input.opened ? 'opened' : 'sent';
}

export function invitationResendWindow(input: {
  readonly sentAt: Date;
  readonly lastResentAt: Date | null;
  readonly resendCount: number | null;
  readonly now: Date;
}): InvitationResendWindow {
  const resendsLeft = Math.max(0, INVITATION_MAX_RESENDS - (input.resendCount ?? 0));
  if (resendsLeft === 0) return { canResend: false, resendsLeft, nextResendAt: null };
  const lastSentAt = input.lastResentAt ?? input.sentAt;
  const nextResendAt = new Date(lastSentAt.getTime() + INVITATION_RESEND_INTERVAL_HOURS * HOUR_MS);
  return { canResend: input.now.getTime() >= nextResendAt.getTime(), resendsLeft, nextResendAt };
}
