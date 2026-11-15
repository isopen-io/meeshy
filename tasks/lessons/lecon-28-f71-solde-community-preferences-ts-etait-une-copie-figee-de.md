## Leçon 28 — F71 soldé : `community-preferences.ts` était une copie figée de `conversation-preferences.ts`, sans la diffusion socket ajoutée après-coup au sibling (2026-07-05, itération 104)

Nouvelle variante de la famille « deux chemins jumeaux répondant à la même question produit divergent »
(#57/#62/Leçon 26/Leçon 27), cette fois entre deux ROUTE FACTORIES quasi identiques plutôt qu'entre deux
fonctions pures. `conversation-preferences.ts` (`PUT`/`DELETE /user-preferences/conversations/:id`)
diffuse `USER_PREFERENCES_UPDATED` vers `ROOMS.user(userId)` (multi-device sync, payload versionné)
depuis un cycle antérieur. `community-preferences.ts` implémente EXACTEMENT le même pattern de route
(mêmes champs `isPinned`/`isMuted`/`isArchived`/`customName`/`categoryId`/`orderInCategory`, plus
`isHidden`/`notificationLevel` propres aux communautés) mais n'avait **aucun** appel `broadcastToUser`/
`io.emit` (grep repo-wide confirmé nul) : la copie initiale du fichier a divergé du fix suivant, jamais
rétro-porté sur son sibling. Effet live : pin/mute/archive/hide/rename d'une communauté depuis un
onglet ou un appareil restait invisible pour toute autre session ouverte du même utilisateur jusqu'à un
refetch manuel — exactement la classe de bug déjà corrigée côté conversation.

**Fix** : nouveau type `UserPreferencesCommunityUpdatedEventData` (discriminant `communityId`, SANS
`version` — `UserCommunityPreferences` n'a pas ce champ en base, pas de migration Prisma nécessaire ;
le consommateur web réagit en invalidant son cache React Query plutôt qu'en réconciliant un snapshot
optimiste versionné) ajouté à l'union `UserPreferencesUpdatedEventData`. `PUT`/`DELETE` de
`community-preferences.ts` diffusent désormais via le même helper `broadcastToUser` que le sibling.
Web : `use-socket-cache-sync.ts` discrimine la nouvelle branche `'communityId' in data` et invalide
`queryKeys.communities.preferences.detail/list`. RED→GREEN : nouveau
`community-preferences-broadcast.test.ts` (3 cas, 2/3 rouges avant fix) + 2 cas web dans
`use-socket-cache-sync.test.tsx`. Suites ciblées vertes : gateway `preferences` 394/394,
web `community` 70/70 ; `packages/shared` `bun run build` 0 erreur ; `tsc --noEmit` gateway/web sans
nouvelle erreur (bruit préexistant documenté, non lié : `SequenceService.ts` TS2305, itération 86).

**Règle réutilisable** : quand un fix (diffusion socket, garde de concurrence, check de blocage…) est
ajouté à UNE route factory, grep immédiatement les routes SŒURS qui partagent la même forme
(`grep -rn "PUT.*preferences" routes/`, ou plus généralement chercher les fichiers dont le nom suit le
même gabarit — ici `*-preferences.ts`) — une copie de code initiale figée avant le fix ne le reçoit
jamais automatiquement, et rien ne le signale (pas d'erreur, pas de test qui casse, juste un
comportement silencieusement différent entre deux entités qui devraient se comporter pareil).
