import type { Prisma } from '@meeshy/shared/prisma/client';
import { GlobalUserRole, isPlatformTeam } from '@meeshy/shared/types/role-types';
import { unsetOrNull } from '../../utils/prisma-unset';

/**
 * Un compte qui peut agir ou recevoir : actif, ni supprimé, ni désactivé. Le talkie
 * l'exigeait seul ; le privilège d'équipe (#16623) l'exige partout où il lit un rôle,
 * pour qu'un compte parti ne garde pas le niveau Sang de ses anciens collègues.
 */
export type AccountState = {
  readonly isActive: boolean;
  readonly deletedAt: Date | null;
  readonly deactivatedAt: Date | null;
};

export const ACCOUNT_STATE_SELECT = { isActive: true, deletedAt: true, deactivatedAt: true } as const;

export const isUsableAccount = <T extends AccountState>(account: T | null | undefined): account is T =>
  !!account && account.isActive === true && !account.deletedAt && !account.deactivatedAt;

/**
 * La MÊME loi, côté `where` — et les deux moitiés ne se substituent pas.
 *
 * `isUsableAccount` juge une LIGNE DÉJÀ CHARGÉE : le client Prisma rend `null`
 * pour une colonne absente comme pour une colonne nulle, donc la lecture JS est
 * exacte sans rien savoir de MongoDB. Une SÉLECTION, elle, doit choisir : **dans
 * la traduction PRISMA** d'un `where`, `{ champ: null }` est une ÉGALITÉ, et elle
 * n'apparie pas un document dont la clé est ABSENTE (`isSet` existe depuis
 * Prisma 3.11.1 pour dire les deux états ; ce dépôt est en 6.x).
 *
 * **Ce n'est PAS la sémantique de MongoDB brut**, où `{ champ: null }` apparie
 * aussi la clé manquante. Un `$match` d'agrégation écrit à la main est donc
 * correct tel quel — `services/relations/circlesSummary.ts`, dans ce répertoire,
 * en porte un, et il n'y a rien à y « corriger ».
 *
 * Or **aucun des deux chemins de création de compte n'écrit ces colonnes** —
 * `registration.service.ts` (l'inscription) ni `user-management.service.ts`
 * (création par un administrateur). L'absence est donc l'état de tout compte qui
 * n'a jamais été désactivé ni supprimé, c'est-à-dire la population entière ;
 * seuls `updateStatus` et la réactivation posent `deactivatedAt: null`. Composé
 * à la main, ce prédicat n'appariait AUCUN compte, et quatre portes refusaient
 * tout le monde : la présence d'équipe (#16623), la synchronisation
 * d'appartenance de communauté, l'adoption de salon et la notification
 * « ajouté à une communauté » (#19799). C'est la cinquième fois que la même
 * sémantique se paie sur `User` — la diffusion n'atteignait personne (leçon 318,
 * `jobs/broadcast-recipients.ts`), le compteur de présence de communauté portait
 * déjà la forme juste en ligne.
 *
 * **Ce que ces deux clauses portent, et ce qu'elles ne portent pas.** Mesuré le
 * 2026-11-19 : tout écrivain de `deactivatedAt` ou de `deletedAt` pose AUSSI
 * `isActive: false` (`user-management.service.ts` pour `updateStatus`, `deleteUser`
 * et `restoreUser`, `routes/account-deletion.ts`, `MaintenanceService.ts`,
 * `migrations/migrate-from-legacy.ts`). Sur les données d'aujourd'hui, la loi
 * ÉQUIVAUT donc à `{ isActive: true }`, et les deux `unsetOrNull` sont de la
 * défense en profondeur — elles n'excluent personne que `isActive` n'exclue
 * déjà. C'est dit ici pour qu'on ne lise pas « six portes refusaient tout le
 * monde » comme « ces clauses portent le verdict » : ce qui refusait tout le
 * monde était l'ÉGALITÉ NUE, et ce qui admet aujourd'hui est `isActive`.
 *
 * La clé rendue est `AND` : un `where` qui porte DÉJÀ son propre `AND` compose
 * (`AND: [...USABLE_ACCOUNT_WHERE.AND, ...sien]`) au lieu de spreader, sans quoi
 * l'un écrase l'autre — le seul piège de cette constante, celui de `unsetOrNull`
 * un étage plus haut.
 */
export const USABLE_ACCOUNT_WHERE = {
  isActive: true,
  AND: [unsetOrNull('deletedAt'), unsetOrNull('deactivatedAt')],
} as const satisfies Prisma.UserWhereInput;

const STORED_ROLES: ReadonlySet<string> = new Set<string>(Object.values(GlobalUserRole));

/**
 * Le rôle que la loi d'accès lit (`viewerRole` / `targetRole`) : celui d'un compte
 * utilisable, sinon aucun — un compte parti n'ouvre rien par son rôle. Un rôle stocké
 * hors des valeurs exactes de l'énumération n'est aucun rôle : l'énumérateur de l'équipe
 * (`teamPeers.ts`) filtre la base sur ces valeurs, et la loi lue en base doit dire la même
 * équipe que lui (#16623, audit du 2026-11-08).
 */
export const lawRoleOf = (account: (AccountState & { readonly role: string | null }) | null | undefined): string | null =>
  isUsableAccount(account) && account.role !== null && STORED_ROLES.has(account.role) ? account.role : null;

/**
 * Un compte UTILISABLE de l'équipe (ANALYST et au-dessus) : celui qui, face à un autre
 * compte de l'équipe, a les outils de cercle sans lien (#16623). Ce n'est jamais un accès —
 * la loi juge chaque paire — mais ce qui dit où chercher hors des liens (#16642).
 */
export const isUsableTeamAccount = (account: (AccountState & { readonly role: string | null }) | null | undefined): boolean =>
  isPlatformTeam(lawRoleOf(account));
