/**
 * LES RÔLES DE PLATEFORME PRIVILÉGIÉS (#11217, décision porteur du 2026-10-24 :
 * « MODERATOR de plateforme est PRIVILÉGIÉ partout, comme ADMIN et BIGBOSS »).
 *
 * UNE table, lue par toutes les admissions qui privilégient un rôle de
 * plateforme : l'autorité dans une conversation (`conversation-authority`,
 * passerelle), l'édition et la suppression du message d'autrui, l'écriture et
 * l'épinglage là où le rang manque, l'historique entier, l'effectif exact, la
 * modération des posts, et la loi d'actions des clients (`message-action-policy`,
 * `conversation-action-policy`) avec son miroir Swift (`PlatformRole.privileged`).
 * La garde `__tests__/platform-privilege.test.ts` refuse toute autre liste
 * littérale de ces trois rôles.
 *
 * Comparaison EXACTE : `User.role` est un enum Prisma en majuscules. Une chaîne
 * en minuscules ne vient que d'une charge forgée, et elle ne privilégie rien.
 * AUDIT et ANALYST lisent des journaux ; ils restent ordinaires.
 *
 * Ce que la table ne gouverne PAS, par d'autres décisions : la console
 * d'administration et la visibilité de la présence (`isGlobalAdmin`, ADMIN et
 * BIGBOSS), le lancement d'un appel public (`call-permission`).
 */

import { GlobalUserRole } from '../types/role-types.js';

export const PRIVILEGED_PLATFORM_ROLES: readonly GlobalUserRole[] = Object.freeze([
  GlobalUserRole.BIGBOSS,
  GlobalUserRole.ADMIN,
  GlobalUserRole.MODERATOR,
]);

const PRIVILEGED: ReadonlySet<string> = new Set(PRIVILEGED_PLATFORM_ROLES);

export const isPrivilegedPlatformRole = (role: string | null | undefined): boolean => PRIVILEGED.has(role ?? '');
