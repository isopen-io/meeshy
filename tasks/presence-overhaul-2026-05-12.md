# Présence en ligne — refonte 2026-05-12

## Symptômes utilisateur
- Utilisateurs marqués `online` alors que déconnectés
- Statut ne se met jamais à jour
- Bug sur webapp (meeshy.me) + iOS app
- Toutes surfaces : liste `/conversations`, header conversation, sidebar détails

## Diagnostic résumé
La chaîne socket fonctionne théoriquement, mais 4 failles structurelles :
1. **Pas de snapshot initial** : à la connexion, le client n'a aucun moyen de savoir qui est CURRENTLY online. Il dépend uniquement des futurs events `USER_STATUS` qui n'arrivent que si quelqu'un change d'état.
2. **DB désynchronisée** : (a) `MaintenanceService.startMaintenanceTasks()` reset tous les `isOnline:true` au boot sans re-marquer les sockets déjà connectés ; (b) `pingTimeout=10s` + `pingInterval=25s` = ~35s de latence avant détection ; (c) iOS Safari peut tuer le socket sans préavis.
3. **Aucune resync périodique** côté client (juste un tick visuel de 60s).
4. **Hook web** `useUserStatusRealtime` monté uniquement dans `ConversationLayout` — pages `/u/[id]`, `/dashboard`, posts n'écoutent rien.

## Plan d'exécution

### Phase G — Gateway (priorité 1, débloque les clients) — DONE (vérifié 2026-07-03)
- [x] **G1** `MaintenanceService.startMaintenanceTasks()` : predicate `isCurrentlyConnected` injecté, ne reset plus les users couramment dans `connectedUsers` Map.
- [x] **G2** Event `presence:snapshot` émis à la fin de l'authentification (cache TTL 60s, `MeeshySocketIOManager.ts`).
- [x] **G3** `GET /users/presence?ids=...` (`services/gateway/src/routes/users/presence.ts`).
- [x] **G4** `GET /conversations` (core.ts:478-521) : override runtime de `isOnline` via `presenceChecker.isOnline(...)`.
- [x] **G5** `PRESENCE_SNAPSHOT` déclaré dans `packages/shared/types/socketio-events.ts`.

### Phase W — Web (consommation des nouveautés) — DONE (vérifié 2026-07-03)
- [x] **W1** `PresenceProvider` global monté dans `app/layout.tsx`, wrappe `useUserStatusRealtime()`.
- [x] **W2** `useUserStatusRealtime` écoute `PRESENCE_SNAPSHOT` → `mergeParticipants` bulk update.
- [x] **W3** Resync REST `/users/presence?ids=...` au retour de focus tab + reconnect, debounce 1s.

### Phase I — iOS (symétrique) — implémenté (fichiers présents : `MessageSocketManager.swift`, `PresenceManager.swift`,
`BackgroundTransitionCoordinator.swift` référencent le snapshot/presence) — non re-vérifié en détail faute de
toolchain Swift dans cet environnement ; à confirmer sur macOS si un doute survient.
- [x] **I1** `PresenceSnapshotEvent` dans `MessageSocketManager`.
- [x] **I2** Cache de présence iOS consomme le snapshot.
- [x] **I3** Souscription `user:status` globale.
- [x] **I4** Refresh REST `/users/presence` sur reconnect/foreground (`PresenceManager`/`BackgroundTransitionCoordinator`).

## Sequencing
1. Phase G en un commit gateway (atomique, déployable indépendamment)
2. Phase W en un commit web (consomme G)
3. Phase I en un commit iOS (consomme G)

## Notes
- Pas de breaking change : `presence:snapshot` est un nouvel event optionnel ; les clients legacy ignorent
- L'endpoint REST `/users/presence` est nouveau, pas de migration
- L'override runtime de `isOnline` dans REST `/conversations` change la sémantique mais reste compatible client
