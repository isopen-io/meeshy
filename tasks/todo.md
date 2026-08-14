# Cycle 16 — le socket restait scellé sur le jeton de sa naissance

Branche : `claude/keen-hamilton-55j95x`, partie de `origin/main` (le cycle
précédent — miroir de connexion, PR #2991 — était intégralement mergé).

## Point de départ (Phase 1)

Pas de recensement neuf : reprise directe du reste ouvert nommé en fin de
cycle 15, « `initializeConnection()` rend `null` sur JWT expiré et rien ne
réessaie ». L'instruction de la routine est de partir du développement
précédent, c'est donc sa dette qui ouvre ce cycle.

## Défauts retenus (Phases 2 / 3 / 10)

**D1 — le socket ne rejoue jamais que le jeton avec lequel il est né.**
`io(url, { auth: { token } })` fige les identifiants à la construction et
Socket.IO rejoue cette charge à CHAQUE reconnexion. Trois chemins font tourner
le jeton sous ses pieds (401 REST, pré-contrôle d'expiration, rotation de
session anonyme) : après l'un d'eux, chaque handshake présente un jeton refusé,
la boucle interne brûle ses 5 tentatives, `reconnect_failed` passe la main à
notre backoff, qui represente le même jeton mort — indéfiniment. Déclencheur
le plus banal : un redéploiement de la passerelle.

**D2 — le démarrage à jeton expiré ne produit aucun socket, et rien ne
revient.** Le rafraîchissement REST réussit sans que personne ne le dise à la
couche temps réel. Seules les actions SORTANTES (`sendMessage`,
`joinConversation`) réveillent la connexion : un lecteur resté sur la liste des
conversations n'en déclenche aucune et n'a plus RIEN en temps réel pour toute
la session.

**D3 — `expiresIn` écrit dans l'emplacement du jeton de session** (décalage de
position d'argument dans `authService.refreshToken()`). Sans conséquence
observable, le test existant verrouillait le décalage.

Analyse complète : `tasks/realtime-sync-audit-2026-07-11.md` § Cycle 16.

## Correctifs

- `auth` devient un **résolveur** réévalué à chaque handshake, et le rustinage
  impératif `socket.auth = { token }` disparaît (il remplacerait le résolveur).
- `authManager.registerOnTokensUpdated()` — l'orchestrateur (et non
  `ConnectionService`, qui ne sait pas brancher les écouteurs) rouvre le socket
  quand il n'en existe aucun.
- `refreshToken()` passe `expiresIn` dans son propre emplacement.

## Fichiers touchés

- `apps/web/services/socketio/connection.service.ts`
- `apps/web/services/socketio/orchestrator.service.ts`
- `apps/web/services/auth-manager.service.ts`
- `apps/web/services/auth.service.ts`
- 6 fichiers de tests (+14 tests neufs, 2 doublures mises à jour)
- `CHANGELOG.md`, `tasks/lessons.md` (leçon 247), journal du cycle

## Gates

- 14 tests vus ROUGES avant les correctifs, verts après.
- `apps/web` : **571 suites / 12 231 tests verts**, 21 skipped (suite complète).
- `tsc --noEmit` : 1229 erreurs avant ET après — base pré-existante identique
  au cycle 15, rien de neuf sur les fichiers touchés.
- iOS : hors périmètre (aucun fichier Swift touché ; pas de toolchain Swift sur
  ce runner Linux). Le SDK a été LU et vérifié exempt de D1/D2 —
  `AuthManager.applySession` reconnecte les sockets sur rotation de jeton.

## Prochains candidats

- `visibilitychange` → `connect()` (hérité du cycle 15, toujours sans risque).
- Un socket existant mais bloqué en reconnexion n'est pas relancé par
  `onTokensUpdated` — volontaire (D1 le couvre), à regarder si un onglet reste
  muet malgré un socket présent.
- Restes du cycle 14 : validation ObjectId de `categoryId`, scope communauté de
  `user:preferences-updated` côté iOS.
