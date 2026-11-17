/**
 * **LES CLÉS DE SOI** (#18914) — module SANS dépendance, motif
 * `friends-keys.ts` : le temps réel (`socket.ts`) et la session qui suit le
 * profil servi (`served-profile-session.ts`) nomment ces requêtes sans
 * emporter le port du profil, ses décodeurs ni `zod` dans leur chunk
 * (`budgets.json › realtime`). `profile.ts` les réexporte.
 */
export const MY_PROFILE_QUERY_KEY = ['me', 'profile'] as const;
