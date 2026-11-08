export type SearchState = 'idle' | 'loading' | 'error' | 'offline' | 'ready';

/**
 * L'ÉTAT D'UNE RECHERCHE GÉNÉRALE (#14619, #14620) — lu par la section
 * « Messages » de la liste et par les trois onglets de `/search`. Une requête
 * sous le seuil n'interroge rien : l'état est le REPOS, jamais un vide qui
 * accuserait la recherche.
 */
export function searchStateOf(input: {
  readonly query: string | null;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly online: boolean;
}): SearchState {
  if (input.query === null) return 'idle';
  if (input.isError) return input.online ? 'error' : 'offline';
  return input.isPending ? 'loading' : 'ready';
}
