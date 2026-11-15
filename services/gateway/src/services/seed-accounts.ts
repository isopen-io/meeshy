/**
 * Les TROIS comptes de bootstrap, et la seule chose qu'on sait vraiment
 * d'eux : leur adresse ne reçoit aucun courrier (#6581).
 *
 * `meeshy@meeshy.me`, `admin@meeshy.me`, `atabeth@meeshy.me` n'ont aucune
 * boîte réelle — personne ne peut cliquer un lien de vérification qui
 * n'arrive nulle part. Ce fait a DEUX conséquences opposées, et c'est
 * pourquoi elles vivent dans le MÊME fichier :
 *
 *  1. VERS L'INTÉRIEUR — le compte doit naître VÉRIFIÉ, sinon
 *     `requireEmailVerification` (#6437) lui rend `403 EMAIL_NOT_VERIFIED` à
 *     sa première publication : il ne peut ni publier, ni alimenter la
 *     bibliothèque de sons, qui ne naît que d'une publication publique.
 *  2. VERS L'EXTÉRIEUR — le canal e-mail ne doit JAMAIS lui écrire.
 *     `emailVerifiedAt` n'est pas qu'une porte de publication : c'est le
 *     prédicat de DÉLIVRABILITÉ des diffusions admin
 *     (`buildBroadcastRecipientFilter` + la contrainte de canal). Poser la
 *     date PARCE QUE l'adresse ne reçoit rien, et laisser l'envoyeur en
 *     déduire qu'elle reçoit, garantit un REBOND DUR à chaque campagne — et
 *     la réputation d'expéditeur se paie sur toutes les autres adresses.
 *
 * Une seule liste, donc, lue des deux côtés : la porte de publication ne peut
 * plus s'ouvrir sur une adresse que le canal e-mail n'exclut pas.
 *
 * Les valeurs sont lues à CHAQUE APPEL, jamais figées au chargement du
 * module : un déploiement configure ces adresses par variables
 * d'environnement, et les témoins les font varier.
 */

/** Le RÔLE du compte semé — fixe, contrairement à son pseudo et à son adresse. */
export type SeedAccountRole = 'meeshy' | 'admin' | 'atabeth';

export type SeedAccount = {
  readonly role: SeedAccountRole;
  readonly username: string;
  readonly email: string;
};

/** Comparaison d'adresses telle que la fait le reste du gateway : insensible à la casse et aux espaces. */
export function sameEmailAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function seedAccountUsername(role: SeedAccountRole): string {
  if (role === 'atabeth') return process.env.ATABETH_USERNAME || 'atabeth';
  return role;
}

export function seedAccountEmail(role: SeedAccountRole): string {
  if (role === 'meeshy') return process.env.MEESHY_EMAIL || 'meeshy@meeshy.me';
  if (role === 'admin') return process.env.ADMIN_EMAIL || 'admin@meeshy.me';
  return process.env.ATABETH_EMAIL || 'atabeth@meeshy.me';
}

const ROLES: readonly SeedAccountRole[] = ['meeshy', 'admin', 'atabeth'];

export function seedAccounts(): readonly SeedAccount[] {
  return ROLES.map((role) => ({ role, username: seedAccountUsername(role), email: seedAccountEmail(role) }));
}

/** Les adresses qu'aucun envoi ne doit atteindre. */
export function undeliverableSeedEmails(): readonly string[] {
  return seedAccounts().map(({ email }) => email);
}

/**
 * La LIGNE du compte semé réclame-t-elle la vérification d'office ?
 *
 * Deux refus, chacun payé par une mesure :
 *
 *  · `emailVerifiedAt` déjà posée — une vérification RÉELLE ne se rejoue pas.
 *    Mesuré en production le 2026-09-15 : `atabeth` porte
 *    `2026-02-15T13:01:17.760Z`, une date posée à la main il y a sept mois.
 *
 *  · L'adresse n'est PLUS celle du seed. Le prédicat n'est pas « ce pseudo est
 *    semé » mais « l'adresse est encore invérifiable ». La production MONTRE le
 *    repurposing : le 2026-09-15, `atabeth` porte `zuymanto@gmail.com` et le
 *    rôle `USER` — une adresse RÉELLE, dont la vérification est une affirmation
 *    sur une personne, pas une commodité de démonstration.
 *
 * Il existe un TROISIÈME refus, et il n'est pas ici parce qu'il ne se lit pas
 * sur la ligne : un administrateur peut avoir TRANCHÉ
 * (`PATCH /admin/users/:id/verifications`, motif obligatoire, trace
 * `UserAuditAction.VERIFY_EMAIL`). Il exige une lecture du journal d'audit, et
 * vit donc à l'unique site qui la fait — `InitService.ensureSeedAccountVerified`.
 * Le déclarer ici en paramètre que personne n'alimente ferait croire cette
 * fonction suffisante : un appelant qui ne lit pas le journal réécrirait la
 * date SANS AUCUNE TRACE, en passant par une porte qui a l'air de l'interdire.
 */
export function maySeedEmailVerification(input: {
  readonly emailVerifiedAt?: Date | null;
  readonly email?: string | null;
  readonly seedEmail: string;
}): boolean {
  if (input.emailVerifiedAt) return false;
  return sameEmailAddress(input.email, input.seedEmail);
}
