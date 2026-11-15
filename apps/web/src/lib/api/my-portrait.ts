import type { QueryClient } from '@tanstack/react-query';

/**
 * **UN PORTRAIT ET UN NOM, PARTOUT OÙ LE CACHE EN GARDE UNE COPIE** (#8886,
 * #8889, #8890).
 *
 * Chaque charge servie RECOPIE l'identité de son auteur : les participants
 * d'une conversation (leur copie locale ET le compte lié), l'expéditeur de
 * chaque message, les membres, les demandes d'amis, les suggestions de
 * mention, une fiche publique… Une trentaine de clés de requêtes, dont chacune
 * est une forme différente. Les réécrire une à une serait un inventaire à
 * tenir à jour — et la clé ajoutée demain l'oublierait sans qu'aucun témoin ne
 * rougisse.
 *
 * La règle est donc dite UNE fois, sur la forme, pas sur la clé : un objet
 * DÉSIGNE un utilisateur quand son `id` ou son `userId` est le sien. Elle vaut
 * pour MOI à la confirmation d'un geste (`profile-actions.ts`) comme pour un
 * PAIR quand la passerelle l'annonce (`user:updated`, `socket.ts`). Tout le
 * reste garde son identité — une requête qui ne le porte pas n'est ni
 * réécrite ni re-rendue.
 *
 * **Le PORTRAIT** (`avatar`, `avatarUrl`, `banner`) a trois états, comme le
 * delta de `user:updated` et la loi iOS (#9371) : ABSENT (`undefined`)
 * n'efface rien ; `null` le RETIRE — la case qui tenait une photo (ou déjà
 * `null`) passe à `null`, une case absente le reste, pour ne pas faire mentir
 * une forme qui ne la déclarait pas.
 *
 * **Le NOM** voyage en GROUPE (`displayName`, `firstName`, `lastName`,
 * `username` — règle de `UserUpdatedEventData`), et il a deux formes, que la
 * désignation distingue :
 * - une ligne de PARTICIPANT (désignée par `userId`, son `id` est le sien)
 *   porte le nom COMPOSÉ — `displayName > « Prénom Nom » > username`, la
 *   composition que la passerelle réécrit dans `Participant.displayName`
 *   (`participantNameSnapshots.ts`) et le titre d'une conversation directe ;
 * - un objet COMPTE (désigné par `id`) porte `User.displayName` tel quel, et
 *   un nom d'affichage EFFACÉ y reste effacé.
 * Un prénom ou un nom effacé garde la forme de sa case : `''` là où elle
 * tenait une chaîne, `null` ailleurs.
 */

export type ProfileName = {
  readonly displayName: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly username: string;
};

export type ProfileRepaint = {
  readonly userId: string;
  readonly avatar?: string | null;
  readonly banner?: string | null;
  readonly name?: ProfileName;
};

export type MyPortrait = {
  readonly userId: string;
  readonly avatar: string | null;
  readonly banner: string | null;
};

type Plain = Readonly<Record<string, unknown>>;

type Designation = 'account' | 'participant';

const PORTRAIT_FIELDS: Readonly<Record<string, 'avatar' | 'banner'>> = { avatar: 'avatar', avatarUrl: 'avatar', banner: 'banner' };

const isPlain = (value: unknown): value is Plain => {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isTextSlot = (value: unknown): boolean => value === undefined || value === null || typeof value === 'string';

const nonBlank = (value: string | null): string | undefined => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
};

export function composedName(name: ProfileName): string {
  const fullName = nonBlank([name.firstName, name.lastName].map((part) => part?.trim() ?? '').filter(Boolean).join(' '));
  return nonBlank(name.displayName) ?? fullName ?? name.username;
}

function designationOf(value: Plain, userId: string): Designation | undefined {
  if (value.id === userId) return 'account';
  return value.userId === userId ? 'participant' : undefined;
}

const clearedLike = (current: unknown): string | null => (typeof current === 'string' ? '' : null);

function servedName(key: string, current: unknown, designation: Designation, name: ProfileName): unknown {
  switch (key) {
    case 'displayName':
      return designation === 'participant' ? composedName(name) : name.displayName;
    case 'username':
      return name.username;
    case 'firstName':
    case 'lastName':
      return name[key] ?? clearedLike(current);
    default:
      return undefined;
  }
}

const portraitServed = (current: unknown, next: string | null | undefined): unknown => {
  if (next === undefined) return current;
  return next ?? (current === undefined ? current : null);
};

function servedFor(key: string, current: unknown, designation: Designation | undefined, update: ProfileRepaint): unknown {
  if (designation === undefined || !isTextSlot(current)) return repaint(current, update);
  const portrait = PORTRAIT_FIELDS[key];
  if (portrait !== undefined) return portraitServed(current, update[portrait]);
  const named = update.name === undefined ? undefined : servedName(key, current, designation, update.name);
  return named === undefined ? current : named;
}

function repaint(value: unknown, update: ProfileRepaint): unknown {
  if (Array.isArray(value)) {
    const next = value.map((item) => repaint(item, update));
    return next.every((item, index) => item === value[index]) ? value : next;
  }
  if (!isPlain(value)) return value;
  const designation = designationOf(value, update.userId);
  const entries = Object.entries(value).map(([key, current]) => [key, servedFor(key, current, designation, update)] as const);
  return entries.every(([key, next]) => next === value[key]) ? value : Object.fromEntries(entries);
}

export function repaintProfile(queryClient: QueryClient, update: ProfileRepaint): void {
  queryClient
    .getQueryCache()
    .getAll()
    .forEach((query) => {
      const current: unknown = query.state.data;
      const next = repaint(current, update);
      if (next !== current) queryClient.setQueryData(query.queryKey, next);
    });
}

const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const portraitOf = (changes: Plain, key: 'avatar' | 'banner'): { readonly avatar?: string | null } | { readonly banner?: string | null } =>
  typeof changes[key] === 'string' || changes[key] === null ? { [key]: changes[key] } : {};

/**
 * `user:updated` (#8889) → ce que le cache doit repeindre. Seuls les six champs
 * publics du contrat sont lus — ce que la charge porterait À CÔTÉ n'entre dans
 * aucun cache. Le nom n'est lu qu'en GROUPE, marqué par `username` : un
 * composant seul est irrecomposable (`UserUpdatedEventData`).
 */
export function profileRepaintOfUserUpdated(payload: unknown): ProfileRepaint | null {
  if (!isPlain(payload) || typeof payload.userId !== 'string' || !isPlain(payload.changes)) return null;
  const changes = payload.changes;
  const name: ProfileName | undefined =
    typeof changes.username === 'string'
      ? {
          displayName: textOrNull(changes.displayName),
          firstName: textOrNull(changes.firstName),
          lastName: textOrNull(changes.lastName),
          username: changes.username,
        }
      : undefined;
  return {
    userId: payload.userId,
    ...portraitOf(changes, 'avatar'),
    ...portraitOf(changes, 'banner'),
    ...(name === undefined ? {} : { name }),
  };
}

/**
 * Mon portrait CONFIRMÉ (`profile-actions.ts`) porte `null` pour « pas d'image
 * de ce genre », pas pour « je viens de la retirer » : un `null` n'y devient
 * jamais un retrait.
 */
export const repaintMyPortrait = (queryClient: QueryClient, portrait: MyPortrait): void =>
  repaintProfile(queryClient, {
    userId: portrait.userId,
    ...(portrait.avatar === null ? {} : { avatar: portrait.avatar }),
    ...(portrait.banner === null ? {} : { banner: portrait.banner }),
  });
