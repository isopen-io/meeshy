import type { QueryClient } from '@tanstack/react-query';

/**
 * **MON PORTRAIT, PARTOUT OÙ LE CACHE EN GARDE UNE COPIE** (#8886).
 *
 * Chaque charge servie RECOPIE la photo de son auteur : les participants d'une
 * conversation (leur surcharge locale ET le compte lié), l'expéditeur de chaque
 * message, les membres, les demandes d'amis, les suggestions de mention, ma
 * fiche publique… Une trentaine de clés de requêtes, dont chacune est une
 * forme différente. Après un changement de photo CONFIRMÉ, les réécrire une à
 * une serait un inventaire à tenir à jour — et la clé ajoutée demain l'oublierait
 * sans qu'aucun témoin ne rougisse.
 *
 * La règle est donc dite UNE fois, sur la forme, pas sur la clé : un objet
 * me DÉSIGNE quand son `id` ou son `userId` est le mien ; ses champs de
 * portrait présents (`avatar`, `avatarUrl`, `banner`) prennent la valeur
 * SERVIE. Tout le reste garde son identité — une requête qui ne me porte pas
 * n'est ni réécrite ni re-rendue.
 *
 * **Une valeur ABSENTE n'efface rien** : le web ne retire jamais sa photo, et
 * les formes du cache ne s'accordent pas sur le vide (`null` ici, `undefined`
 * là). Remplacer une copie par un vide ferait mentir une forme ; on ne propage
 * qu'une photo.
 *
 * Aucun retour arrière n'est nécessaire : ce passage n'a lieu qu'à la
 * CONFIRMATION, jamais pendant le vol — l'aperçu du vol vit dans l'écran.
 */

export type MyPortrait = {
  readonly userId: string;
  readonly avatar: string | null;
  readonly banner: string | null;
};

type PortraitField = 'avatar' | 'banner';

const PORTRAIT_FIELDS: Readonly<Record<string, PortraitField>> = { avatar: 'avatar', avatarUrl: 'avatar', banner: 'banner' };

type Plain = Readonly<Record<string, unknown>>;

const isPlain = (value: unknown): value is Plain => {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isPortraitSlot = (value: unknown): boolean => value === undefined || value === null || typeof value === 'string';

const designates = (value: Plain, userId: string): boolean => value.id === userId || value.userId === userId;

function servedFor(key: string, current: unknown, mine: boolean, portrait: MyPortrait): unknown {
  const field = PORTRAIT_FIELDS[key];
  if (!mine || field === undefined || !isPortraitSlot(current)) return repaint(current, portrait);
  return portrait[field] ?? current;
}

function repaint(value: unknown, portrait: MyPortrait): unknown {
  if (Array.isArray(value)) {
    const next = value.map((item) => repaint(item, portrait));
    return next.every((item, index) => item === value[index]) ? value : next;
  }
  if (!isPlain(value)) return value;
  const mine = designates(value, portrait.userId);
  const entries = Object.entries(value).map(([key, current]) => [key, servedFor(key, current, mine, portrait)] as const);
  return entries.every(([key, next]) => next === value[key]) ? value : Object.fromEntries(entries);
}

export function repaintMyPortrait(queryClient: QueryClient, portrait: MyPortrait): void {
  queryClient
    .getQueryCache()
    .getAll()
    .forEach((query) => {
      const current: unknown = query.state.data;
      const next = repaint(current, portrait);
      if (next !== current) queryClient.setQueryData(query.queryKey, next);
    });
}
