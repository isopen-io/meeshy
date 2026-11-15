/**
 * Nommer les personnes — le SEUL endroit où la supervision lit des comptes
 * pour les afficher (#8876).
 *
 * Une console qui montre un ObjectId là où elle pourrait montrer « Awa Diop »
 * oblige l'administrateur à ouvrir une autre page pour comprendre la première.
 * Les noms se résolvent donc PAR LOT : un seul `user.findMany` pour toute une
 * page, jamais un par ligne.
 *
 * La projection est volontairement étroite — identité publique, rien d'autre.
 * Aucun e-mail, aucun rôle, aucune présence : ce que cette aide ne sélectionne
 * pas ne peut pas partir à côté.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { OBJECT_ID_REGEX } from '@meeshy/shared/utils/object-id';

export type AdminPersonRef = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
};

export const ADMIN_PERSON_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
} as const;

type PersonRow = {
  readonly id: string;
  readonly username: string;
  readonly displayName?: string | null;
  readonly avatar?: string | null;
};

/** La projection `A` d'une ligne de compte ; `null` pour un compte absent. */
export function toAdminPerson(row: PersonRow | null | undefined): AdminPersonRef | null {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName ?? null,
    avatar: row.avatar ?? null,
  };
}

/** Un identifiant n'atteint Prisma que s'il est un ObjectId : sinon la requête lève. */
export const isObjectId = (value: unknown): value is string =>
  typeof value === 'string' && OBJECT_ID_REGEX.test(value);

export function distinctObjectIds(ids: Iterable<string | null | undefined>): string[] {
  return [...new Set([...ids].filter(isObjectId))];
}

/** Les comptes demandés, par identifiant — une seule requête, aucune si rien à chercher. */
export async function loadAdminPeople(
  prisma: PrismaClient,
  ids: Iterable<string | null | undefined>
): Promise<ReadonlyMap<string, AdminPersonRef>> {
  const wanted = distinctObjectIds(ids);
  if (wanted.length === 0) return new Map();

  const rows = await prisma.user.findMany({
    where: { id: { in: wanted } },
    select: ADMIN_PERSON_SELECT,
    take: wanted.length,
  });

  return new Map(rows.map((row) => [row.id, toAdminPerson(row) as AdminPersonRef]));
}

/** Le libellé d'une personne quand une seule chaîne est possible : nom affiché, sinon `@username`. */
export function personLabel(person: Pick<AdminPersonRef, 'username' | 'displayName'>): {
  readonly label: string;
  readonly secondary: string | null;
} {
  const name = person.displayName?.trim();
  return name
    ? { label: name, secondary: `@${person.username}` }
    : { label: `@${person.username}`, secondary: null };
}
