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

### Phase G — Gateway (priorité 1, débloque les clients)
- [ ] **G1** `MaintenanceService.startMaintenanceTasks()` : ne pas reset les users actuellement dans `connectedUsers` Map. Exposer la Map ou injecter un predicate.
- [ ] **G2** Émettre event `presence:snapshot` à la fin de `handleManualAuthentication` + `_authenticateJWTUser` + `_authenticateAnonymousUser` : liste les userIds présents dans `connectedUsers` Map parmi les participants des conversations du nouvel arrivant.
- [ ] **G3** Endpoint REST `GET /users/presence?ids=...` qui retourne `[{userId, isOnline (runtime depuis Map), lastActiveAt (db)}]` — pour resync à la demande.
- [ ] **G4** Patch `GET /conversations` (core.ts) : override `participant.isOnline` et `participant.user.isOnline` avec `connectedUsers.has(userId)` runtime avant return.
- [ ] **G5** Déclarer `PRESENCE_SNAPSHOT` dans `packages/shared/types/socketio-events.ts`.

### Phase W — Web (consommation des nouveautés)
- [ ] **W1** Déplacer `useUserStatusRealtime()` dans un provider global pour qu'il soit monté sur toutes les pages authentifiées.
- [ ] **W2** Dans `useUserStatusRealtime`, écouter aussi `PRESENCE_SNAPSHOT` → bulk update du store.
- [ ] **W3** Sur reconnect socket + sur retour focus tab, déclencher fetch `/users/presence?ids=...` pour resync.

### Phase I — iOS (symétrique)
- [ ] **I1** Ajouter `PresenceSnapshotEvent` dans `MessageSocketManager` + publisher Combine.
- [ ] **I2** Consommer le snapshot dans le cache de présence iOS.
- [ ] **I3** Vérifier que la souscription `user:status` est globale (pas conditionnelle à un écran).
- [ ] **I4** Sur reconnect + foreground app, déclencher refresh REST `/users/presence`.

## Sequencing
1. Phase G en un commit gateway (atomique, déployable indépendamment)
2. Phase W en un commit web (consomme G)
3. Phase I en un commit iOS (consomme G)

## Notes
- Pas de breaking change : `presence:snapshot` est un nouvel event optionnel ; les clients legacy ignorent
- L'endpoint REST `/users/presence` est nouveau, pas de migration
- L'override runtime de `isOnline` dans REST `/conversations` change la sémantique mais reste compatible client
