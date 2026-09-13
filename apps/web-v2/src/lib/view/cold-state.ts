/**
 * **CE QU'UN ÉCRAN PEINT AVANT SA PREMIÈRE PAGE** (#6419).
 *
 * TanStack Query ne fait pas ÉCHOUER une requête hors ligne : dès l'événement
 * `offline`, `onlineManager` la met EN PAUSE — ni données, ni erreur, et elle
 * repart seule au retour du réseau. Lire ce couple comme « chargement »
 * dessinait un squelette sans fin, avec `aria-busy`, sans rien dire de la
 * coupure (mesuré sur `/calls` et `/discover` › Bloqués).
 *
 * Des données en cache gagnent toujours : cache d'abord, même périmé, même en
 * pause, même après un échec.
 */
export type ColdState = 'ready' | 'error' | 'offline' | 'loading';

export function coldStateOf(query: { readonly data: unknown; readonly isError: boolean; readonly isPaused: boolean }): ColdState {
  if (query.data !== undefined) return 'ready';
  if (query.isError) return 'error';
  return query.isPaused ? 'offline' : 'loading';
}
