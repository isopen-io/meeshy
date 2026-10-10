import { getUserPresenceStatus } from '@meeshy/shared/utils/user-presence';

import type { AdminEntityRef } from '@/components/admin/entity-chip';
import type { AdminLanguage } from '@/lib/i18n-admin-catalog';

import { personLabel, personSecondary, type PersonNameFields } from './interpret/labels';

/**
 * Ce qu'il faut d'une personne servie pour la NOMMER et lui poser sa pastille de
 * présence. La présence est facultative : un contact, un auteur ou un
 * modérateur n'en portent pas, et un client ne fabrique jamais ce que le serveur
 * retire (loi de visibilité de la présence).
 */
export type PersonFacts = PersonNameFields & {
  readonly id: string;
  readonly avatar?: string | null;
  readonly isOnline?: boolean | null;
  readonly lastActiveAt?: string | null;
};

/**
 * LA RÉFÉRENCE D'ENTITÉ D'UN COMPTE (#8876) — le VRAI nom (`personLabel`), son
 * `@pseudo`, son avatar, et la présence CALCULÉE par la règle partagée
 * `getUserPresenceStatus` (1/3/5 minutes) : jamais une couleur écrite ici, la
 * pastille se peint par `Avatar presence=`. `now` est injecté.
 */
export function userEntityOf(person: PersonFacts, language: AdminLanguage, now: Date): AdminEntityRef {
  const hasPresence = person.isOnline !== undefined || person.lastActiveAt !== undefined;
  const secondary = personSecondary(person.username);
  return {
    kind: 'user',
    id: person.id,
    label: personLabel(person, language),
    ...(secondary === null ? {} : { secondary }),
    avatarUrl: person.avatar === undefined || person.avatar === null || person.avatar === '' ? null : person.avatar,
    ...(hasPresence
      ? { presence: getUserPresenceStatus({ isOnline: person.isOnline ?? false, lastActiveAt: person.lastActiveAt ?? null }, now.getTime()) }
      : {}),
  };
}
