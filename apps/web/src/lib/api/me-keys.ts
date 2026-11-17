/**
 * **LES CLÉS DE SOI** (#18914) — module SANS dépendance, motif
 * `friends-keys.ts` : le temps réel (`socket.ts`, le pont d'appels) et la
 * session qui suit le profil servi (`served-profile-session.ts`) nomment ces
 * requêtes sans emporter leurs ports, leurs décodeurs ni `zod` dans leur chunk
 * (`budgets.json › realtime`). `profile.ts` les réexporte.
 */
export const MY_PROFILE_QUERY_KEY = ['me', 'profile'] as const;

/** Les réglages d'application (`app-preferences.ts`) — périmés par
 * `user:preferences-updated { userId, category }` sans tirer leur port (#18914). */
export const APP_PREFERENCES_QUERY_KEY = ['me', 'app-preferences'] as const;

/** Le JOURNAL D'APPELS du lecteur (#18922) — chaque filtre et chaque raffinement
 * (`callHistoryQueryKey`, `calls.ts`) vit sous ce préfixe. Le pont d'appels
 * (`lib/calls/call-socket-bridge.ts`, morceau du temps réel) le relit quand un
 * appel finit, sans tirer les décodeurs du journal ni `zod`. */
export const CALL_HISTORY_QUERY_PREFIX = ['calls', 'history'] as const;
