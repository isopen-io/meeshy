/**
 * QUI tient un rang réservé dans World Wide (#10000) — et pourquoi ce n'est
 * jamais un pseudo.
 *
 * L'audit adversarial du lot a montré qu'un username n'est pas une identité :
 * `jcnm` n'est semé nulle part, rien ne le réserve, `GET /auth/check-availability`
 * le dit libre et `PATCH /users/me/username` permet de le libérer puis de le
 * reprendre. Désigner « le compte nommé jcnm » remettait l'administration du
 * salon public officiel — et le droit de rouvrir les termes de son lien — à
 * quiconque s'inscrivait sous ce nom avant le démarrage suivant.
 *
 * Un administrateur réservé est donc désigné par une ADRESSE fournie par la
 * configuration du déploiement, jamais par le dépôt :
 *  · `meeshy` (créateur) par `MEESHY_EMAIL`, et il doit tenir le rôle
 *    plateforme BIGBOSS que lui donne le seed ;
 *  · `admin` par `ADMIN_EMAIL`, rôle plateforme ADMIN ou BIGBOSS ;
 *  · chaque adresse de `WORLD_ADMIN_EMAILS` (séparées par des virgules), quel
 *    que soit son rôle plateforme — c'est ainsi que le porteur (`jcnm`) est
 *    désigné, sans que son adresse soit écrite dans le dépôt.
 *
 * Le rôle plateforme exigé des deux comptes semés ferme le second squat :
 * `ensureSeedAccountsVerified` vérifie d'office l'adresse semée d'un compte au
 * pseudo semé ; sur une base où `admin` aurait disparu, un tiers inscrit sous
 * ce pseudo et cette adresse serait vérifié — il resterait USER.
 *
 * Et le compte désigné doit être LÉGITIME aujourd'hui : actif, non supprimé,
 * adresse vérifiée. Un compte écarté est journalisé par sa DÉSIGNATION, jamais
 * par son adresse.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MemberRoleType } from '@meeshy/shared/types/role-types';
import { sameEmailAddress, seedAccountEmail } from '../seed-accounts';

export type WorldReservedIdentities = {
  readonly creatorEmail: string;
  readonly seedAdminEmail: string;
  readonly worldAdminEmails: readonly string[];
};

export type WorldDesignation = {
  readonly designation: string;
  readonly email: string;
  readonly role: MemberRoleType;
  readonly platformRoles: readonly string[] | null;
};

export type WorldIneligibility = 'inactive' | 'deleted' | 'email-unverified' | 'platform-role';

export type WorldReservedAccount = {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly role: string;
  readonly isActive: boolean;
  readonly deletedAt: Date | null;
  readonly emailVerifiedAt: Date | null;
};

export type DesignatedAccount =
  | { readonly designation: WorldDesignation; readonly status: 'eligible'; readonly account: WorldReservedAccount }
  | { readonly designation: WorldDesignation; readonly status: 'ineligible'; readonly account: WorldReservedAccount; readonly reason: WorldIneligibility }
  | { readonly designation: WorldDesignation; readonly status: 'absent' };

export const WORLD_CREATOR_DESIGNATION = 'meeshy';

/** Le seed n'écrit que sur un `WORLD_SEED_ENABLED=true` explicite — tout autre valeur le laisse muet. */
export function isWorldSeedEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WORLD_SEED_ENABLED === 'true';
}

function parseEmails(raw: string | undefined): readonly string[] {
  return (raw ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

/** Lu à CHAQUE appel : le déploiement configure ces adresses, les témoins les font varier. */
export function worldReservedIdentitiesFromEnv(env: NodeJS.ProcessEnv = process.env): WorldReservedIdentities {
  return {
    creatorEmail: seedAccountEmail('meeshy'),
    seedAdminEmail: seedAccountEmail('admin'),
    worldAdminEmails: parseEmails(env.WORLD_ADMIN_EMAILS),
  };
}

export function worldDesignations(identities: WorldReservedIdentities): readonly WorldDesignation[] {
  const seeded: readonly WorldDesignation[] = [
    { designation: WORLD_CREATOR_DESIGNATION, email: identities.creatorEmail, role: 'creator', platformRoles: ['BIGBOSS'] },
    { designation: 'admin', email: identities.seedAdminEmail, role: 'admin', platformRoles: ['BIGBOSS', 'ADMIN'] },
  ];
  const configured = identities.worldAdminEmails
    .filter((email) => !seeded.some((designation) => sameEmailAddress(designation.email, email)))
    .map((email, index) => ({ designation: `world-admin-${index + 1}`, email, role: 'admin' as const, platformRoles: null }));
  return [...seeded, ...configured];
}

export function worldIneligibility(designation: WorldDesignation, account: WorldReservedAccount): WorldIneligibility | null {
  if (!account.isActive) return 'inactive';
  if (account.deletedAt) return 'deleted';
  if (!account.emailVerifiedAt) return 'email-unverified';
  if (designation.platformRoles && !designation.platformRoles.includes(account.role)) return 'platform-role';
  return null;
}

/** Lecture SEULE : résout chaque désignation sur la base, sans rien écrire. */
export async function designateWorldReservedAccounts(
  prisma: PrismaClient,
  identities: WorldReservedIdentities,
): Promise<readonly DesignatedAccount[]> {
  const designations = worldDesignations(identities);
  const accounts: readonly WorldReservedAccount[] = await prisma.user.findMany({
    where: { email: { in: designations.map((designation) => designation.email.trim().toLowerCase()) } },
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      role: true,
      isActive: true,
      deletedAt: true,
      emailVerifiedAt: true,
    },
  });

  return designations.map((designation): DesignatedAccount => {
    const account = accounts.find((candidate) => sameEmailAddress(candidate.email, designation.email));
    if (!account) return { designation, status: 'absent' };
    const reason = worldIneligibility(designation, account);
    return reason ? { designation, status: 'ineligible', account, reason } : { designation, status: 'eligible', account };
  });
}
