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

/** Les dix-neuf crans « qui est prévenu » (`circle-notify-preferences.ts`) —
 * déclarés ICI, et pas chez eux, pour la raison d'être de ce module : le
 * gestionnaire de `user:preferences-updated` doit les NOMMER sans tirer leur
 * décodeur ni `zod` dans le morceau `realtime` (`budgets.json › realtime`). */
export const CIRCLE_NOTIFY_QUERY_KEY = ['me', 'circle-notify'] as const;

/**
 * **LES REQUÊTES QUI PROJETTENT `UserPreferences`** (#20349) — le document de
 * réglages du compte, dont `user:preferences-updated { userId, category }`
 * annonce qu'une catégorie a changé.
 *
 * La liste est nommée par ce qu'elle PROJETTE, jamais par l'écran qui l'a
 * ouverte en premier. C'est la cause de #20336 rejouée un cran plus bas : le
 * gestionnaire NOMMAIT `APP_PREFERENCES_QUERY_KEY` pour un document qui a sept
 * catégories et DEUX projections, et `['me','circle-notify']` est un FRÈRE de
 * `['me','app-preferences']`, pas un descendant — l'invalidation par préfixe
 * ne l'atteignait donc jamais. Un appareil CONNECTÉ affichait l'ancien cran
 * jusqu'à 30 minutes, sur un réglage de confidentialité.
 *
 * **Toute requête servie par `GET /me/preferences` entre ici**, et le cliquet
 * de source (`preferences-projection-sweep.test.ts`) le demande : c'est la
 * seule garde possible contre une TROISIÈME projection ajoutée par un lot qui
 * parlera d'autre chose. Une clé omise ne rend aucun témoin rouge — elle rend
 * un écran périmé.
 */
export const MY_PREFERENCES_QUERY_KEYS = [APP_PREFERENCES_QUERY_KEY, CIRCLE_NOTIFY_QUERY_KEY] as const;
