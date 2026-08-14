# Cycle — Routine temps réel : le miroir de connexion qui n'avait pas de chemin de retour

## Contexte

Routine programmée « real-time messaging continuous improvement ». Le prompt
demande un audit 16 phases et un merge en fin de cycle. Comme aux cycles
précédents, l'exécution ne tente pas les 16 phases d'un coup : elle fait un
recensement neuf, retient UN défaut prouvable et le mène jusqu'au merge.

Branche : `claude/keen-hamilton-85hts2`, partie de `origin/main` (le cycle
précédent — `CallNotification` groupe, PR #2989 — était intégralement mergé).

## Recensement (Phase 1)

Croisement mécanique des 125 `SERVER_EVENTS` contre les écouteurs web, en
résolvant les constantes (`SERVER_EVENTS.X`) et non les littéraux. 16
événements sans écouteur, **tous écartés** : alias de migration volontaire
(`message:read-status-updated`), écarts de parité (réactions de pièce jointe,
localisation live), hors périmètre (`call:*`), sans consommateur applicatif.

Surfaces re-parcourues et trouvées correctes, consignées dans le journal pour
ne pas être re-défrichées : `delta-sync.ts`, `typing.service.ts`,
`messaging.service.ts`, `use-auto-retry-failed-messages.ts`,
`emitToConversationParticipants.ts`, `broadcastMessageMutation.ts`.

## Défaut retenu (Phases 2 / 3 / 4)

`ConnectionService.state.isConnected` est un miroir qui pouvait descendre sans
jamais remonter. Le handler `offline` le met à `false` sans toucher au socket ;
une coupure plus courte que le cycle ping/pong de Socket.IO ne fait pas tomber
le socket ; `connect()` sortait alors en silence sur `!socket.connected`, donc
aucun `connect` n'était réémis et l'état restait faux pour le reste de la
session.

Coût réel : `useAutoRetryFailedMessages` a `isReady` pour unique déclencheur —
la file des messages en échec n'était plus jamais rejouée, en silence, sur un
lien qui portait pourtant normalement les messages entrants.

Correctif : la réconciliation « le socket est la vérité » vit dans `connect()`,
point de passage de tous les appelants. Analyse complète dans
`tasks/realtime-sync-audit-2026-07-11.md` § Cycle 15.

## Fichiers touchés

- `apps/web/services/socketio/connection.service.ts`
- `apps/web/__tests__/services/socketio/connection.service.test.ts` (+5 tests)
- `CHANGELOG.md` (§ `🐛 Fixed`)
- `tasks/realtime-sync-audit-2026-07-11.md` (journal du cycle)

## Gates

- 3 tests vus ROUGES avant le correctif (dont le scénario `offline`→`online`
  de bout en bout), 2 verrous verts avant ET après.
- `apps/web` : 159 suites / 4001 tests verts (`__tests__/services`,
  `__tests__/hooks`, `hooks/__tests__`, indicateur de connexion).
- `tsc --noEmit` : 1229 erreurs avant ET après le changement — base
  pré-existante inchangée, rien de neuf sur les fichiers touchés.
- iOS : hors périmètre (aucun fichier Swift touché ; pas de toolchain Swift
  sur ce runner Linux).

## Prochains candidats

- `initializeConnection()` rend `null` sur JWT expiré et rien ne rappelle
  `connect()` après un refresh réussi quand AUCUN socket n'a été créé — même
  classe de défaut que celui-ci.
- `visibilitychange` → `connect()` pour couvrir le retour d'un onglet bfcaché
  (`connect()` est désormais idempotent, l'ajout est sans risque).
- Restes du cycle 14 : validation ObjectId de `categoryId`, scope communauté de
  `user:preferences-updated` côté iOS.
