/**
 * LE PLIAGE DES SECTIONS DE LA LISTE (#10103) — toute section se replie :
 * Épingles, les catégories de l'utilisateur, et les sections VIRTUELLES par
 * date (Aujourd'hui, Hier, Cette semaine, Plus ancien).
 *
 * DEUX MÉMOIRES, une par nature de section :
 * - une CATÉGORIE suit sa préférence SERVEUR `isExpanded`
 *   (`UserConversationCategory`), la même qu'iOS écrit : la replier ici la
 *   replie sur chaque appareil du compte. Elle ne s'écrit donc jamais ici ;
 * - une section VIRTUELLE (et Épingles) n'a pas de ligne serveur : son pliage
 *   se mémorise PAR APPAREIL, dans `localStorage`, sous `try` — un stockage
 *   refusé (navigation privée, données bloquées, capture de vignette) rend une
 *   liste tout dépliée, jamais une exception.
 *
 * PENDANT UNE RECHERCHE, rien n'est replié : ce qu'on cherche ne doit pas se
 * cacher derrière un chevron. La mémoire n'est pas touchée — effacer la
 * recherche rend la liste telle qu'on l'avait rangée.
 */
export const FOLDED_SECTIONS_STORAGE_KEY = 'meeshy.lens.folded-sections';

const CATEGORY_PREFIX = 'category:';

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** Le stockage de l'appareil — lu sous `try` : l'ACCESSEUR lui-même peut
 * lever (données de site bloquées). */
function deviceStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readFoldedSections(storage: StorageLike | null = deviceStorage()): ReadonlySet<string> {
  try {
    const raw = storage?.getItem(FOLDED_SECTIONS_STORAGE_KEY) ?? null;
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

export function writeFoldedSections(folded: ReadonlySet<string>, storage: StorageLike | null = deviceStorage()): void {
  const local = [...folded].filter((id) => !id.startsWith(CATEGORY_PREFIX));
  try {
    if (local.length === 0) storage?.removeItem(FOLDED_SECTIONS_STORAGE_KEY);
    else storage?.setItem(FOLDED_SECTIONS_STORAGE_KEY, JSON.stringify(local));
  } catch {
    /* Stockage refusé : le pliage vaut pour cette visite, et c'est tout. */
  }
}

export function toggledFold(folded: ReadonlySet<string>, id: string): ReadonlySet<string> {
  return folded.has(id) ? new Set([...folded].filter((other) => other !== id)) : new Set([...folded, id]);
}

export function isSectionFolded(params: {
  readonly section: { readonly id: string; readonly category?: { readonly isExpanded: boolean } };
  readonly folded: ReadonlySet<string>;
  readonly searching: boolean;
}): boolean {
  const { section, folded, searching } = params;
  if (searching) return false;
  if (section.category !== undefined) return !section.category.isExpanded;
  return folded.has(section.id);
}
