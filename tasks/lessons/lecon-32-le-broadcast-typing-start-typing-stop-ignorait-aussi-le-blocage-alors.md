## Leçon 32 — Le broadcast `typing:start`/`typing:stop` ignorait aussi le blocage, alors que la présence (Leçon 67) venait d'être corrigée (2026-07-05, itération 100)

Sibling drift direct de la Leçon 27, sur un canal encore plus sensible : `_broadcastUserStatus`
(présence) enforce désormais le blocage bidirectionnel, mais `StatusHandler.handleTypingStart`/
`handleTypingStop` (`services/gateway/src/socketio/handlers/StatusHandler.ts`) diffusaient
`typing:start`/`typing:stop` via `socket.to(room).emit(...)` sans AUCUNE vérification de blocage —
seule la préférence globale `shouldShowTypingIndicator` (booléen, sans notion de viewer) était
consultée. Or bloquer ne retire jamais des conversations partagées (fait déjà établi en Leçon 27) :
A bloque B, les deux restent co-participants d'un groupe ; quand B tape dans ce groupe, A voit
« B est en train d'écrire… » en direct alors que `GET /users/presence` masquerait `isOnline`/
`lastActiveAt` pour cette même paire. La frappe est un signal plus sensible que la présence
(prouve un engagement actif, instant par instant) — c'était donc une régression de couverture
laissée ouverte par la Leçon 27 elle-même (fix scopé à `_broadcastUserStatus`, `StatusHandler` non
audité). Un troisième chemin jumeau avait le même trou : `handleSocketDisconnecting` (broadcast
`typing:stop` de secours à la déconnexion, via un `broadcastFn` injecté par
`MeeshySocketIOManager.ts`).

**Fix** : nouveau helper privé `StatusHandler._getBlockedSocketIdsInRoom(userId, conversationId)` —
requête les participants actifs et enregistrés (`userId: { not: null }`, les anonymes ne peuvent ni
bloquer ni être bloqués) de la conversation, filtre ceux actuellement en ligne
(`connectedUsers.has`), puis réutilise `getBlockedUserIdsAmong` (même helper que Leçon 27) pour
résoudre l'ensemble bloqué, et `userSockets` (nouvelle dépendance optionnelle de
`StatusHandlerDependencies`, câblée depuis `MeeshySocketIOManager`) pour mapper vers des socket
ids. Les 3 call sites (`handleTypingStart`, `handleTypingStop`, `handleSocketDisconnecting`) font
`socket.to(room).except(blockedSocketIds).emit(...)` quand la liste est non vide — identique au
pattern déjà validé sur la présence. `handleSocketDisconnecting` devient `async` (await du helper) ;
son `broadcastFn` gagne un 4e paramètre optionnel `exceptSocketIds`. RED→GREEN :
`StatusHandler.test.ts` (×2 fichiers) +5 cas (exclusion sur start/stop/disconnect, no-op quand
personne n'est bloqué, filtre les participants anonymes) + fixtures `makePrisma` étendues
(`participant.findMany`/`user.findMany` par défaut vides, non-régressif). Suite complète
StatusHandler (73/73) + blocking.ts (283/283 avec MeeshySocketIOManager) verte ; le seul échec
tsc/jest restant (`SequenceService.ts` → `@prisma/client` sans export `PrismaClient`) est
pré-existant sur `main`, confirmé par `git stash` avant relance — sans lien avec ce fix.

**Règle réutilisable** : une correction de sibling drift (Leçon 27) doit elle-même être auditée pour
d'autres siblings du MÊME concept produit avant d'être considérée close — ici « présence » et
« frappe » sont deux facettes du même signal (« cet utilisateur est actif maintenant »), et corriger
l'une sans l'autre laisse un vecteur de fuite ouvert, parfois plus grave que celui qu'on vient de
fermer. Lister explicitement TOUS les canaux qui exposent un signal de présence/activité (présence,
frappe, dernière vue, indicateurs de lecture en direct…) et vérifier qu'ils partagent tous la même
politique de blocage avant de clore un correctif de ce type.
