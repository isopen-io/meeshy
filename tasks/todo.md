# Cycle 18 — Le partage de position en direct n'a aucune fin

Routine « amélioration continue temps réel ». Le cycle 17 (PR #2998) a fermé la
chaîne des préférences de conversation. Sa dette nommée est iOS-seule
(scope communauté non routé, faux succès local de `.setClearHistoryBefore`) ou
touche `conversation-preferences.ts`, le fichier même que #2998 modifie — la
reprendre ici produirait un conflit sans gain. Ce cycle repart donc d'un
recensement neuf : **matrice de couverture des 125 `SERVER_EVENTS`** (émis par
la passerelle × traités par le web × traités par iOS).

## Constats

**D1 — un partage en direct n'est jamais retiré quand le socket du partageur meurt.**
`location:live-stopped` n'est émis QUE par `location:live-stop` explicite.
Arrêt forcé de l'app, crash, perte de réseau : aucun stop. Les pairs gardent une
épingle qui se présente comme vivante, figée sur la dernière position connue,
jusqu'à `expiresAt` — soit **jusqu'à 8 heures** (`durationMinutes` ≤ 480). Sur
une fonction dont le contrat entier est « voici où je suis MAINTENANT », servir
une position vieille de plusieurs heures comme actuelle est un défaut de
sécurité, pas d'affichage. Le codebase a déjà exactement ce retrait pour la
frappe (`StatusHandler.handleSocketDisconnecting` → `typing:stop`) ; la position
en direct est le seul état éphémère par socket à ne pas l'avoir.

**D2 — aucun état serveur, donc aucun rattrapage.**
`socket.to(room)` ne touche que les sockets présents à cet instant. Un
participant qui ouvre la conversation APRÈS le début du partage n'apprend jamais
son existence : l'épingle lui est invisible pour toute la session. Le cas se
retourne contre le partageur lui-même — après une reconnexion de son socket, ses
`live-update` partent pour une session qu'aucun pair n'a vu commencer.

**D3 — l'expiration est un indice client que le serveur n'applique jamais.**
`expiresAt` est calculé, expédié, puis oublié. Rien côté serveur ne retire le
partage à son terme, et rien n'empêche de relayer des positions au-delà.

## Correctif — un registre de sessions dans `LocationHandler`

En mémoire, conforme au « real-time only, no Prisma persistence » du handler.
Une entrée par `(conversationId, userId)`.

- [x] `live-start` ouvre la session (position, `expiresAt`, socket propriétaire)
- [x] `live-update` rafraîchit la dernière position connue
- [x] `live-stop` ferme la session
- [x] `disconnecting` retire les sessions de CE socket (retraction diffusée)
- [x] minuterie d'expiration : diffuse `location:live-stopped` au terme
- [x] au-delà du terme, les `live-update` ne sont plus relayés
- [x] `conversation:join` rejoue `location:live-started` au socket entrant
- [x] `dispose()` pour l'arrêt de la passerelle et les tests

## Gates

- [x] tests RED d'abord, verts après
- [x] suite passerelle complète
- [x] `tsc --noEmit` passerelle
- [x] CHANGELOG + journal d'audit + leçons

## Revue

Voir `tasks/realtime-sync-audit-2026-07-11.md` § Cycle 18.
