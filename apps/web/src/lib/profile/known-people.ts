/**
 * **CE QU'ON SAIT DÉJÀ D'UNE PERSONNE TOUCHÉE** (#10092) — le nom et l'avatar
 * qu'une rangée, une bulle ou une mention montrait au moment du toucher. La
 * fiche (page ou feuille) s'en sert pour son PREMIER rendu quand elle n'a
 * jamais été chargée : l'identité se peint tout de suite, le reste attend la
 * réponse. Ce n'est jamais une fiche : ni relation, ni compteurs, ni gestes.
 *
 * Mémoire de l'onglet seulement, bornée : rien n'est persisté, rien ne voyage.
 */
export type KnownPerson = {
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
  /** Le `User.id`, quand la source le portait (la liste des conversations,
   * `known-people-cache.ts`) — absent d'un simple toucher de nom. */
  readonly id?: string | null;
};

const CAPACITY = 200;

let known: ReadonlyMap<string, KnownPerson> = new Map();

const keyOf = (handle: string): string => handle.trim().toLowerCase();

export function rememberPerson(person: KnownPerson): void {
  const key = keyOf(person.username);
  if (key === '') return;
  const previous = known.get(key);
  const merged: KnownPerson = {
    username: person.username,
    displayName: person.displayName ?? previous?.displayName ?? null,
    avatar: person.avatar ?? previous?.avatar ?? null,
    id: person.id ?? previous?.id ?? null,
  };
  const kept = [...known].filter(([entry]) => entry !== key).slice(-(CAPACITY - 1));
  known = new Map([...kept, [key, merged]]);
}

export function knownPerson(handle: string): KnownPerson | null {
  return known.get(keyOf(handle)) ?? null;
}

export function forgetKnownPeople(): void {
  known = new Map();
}
