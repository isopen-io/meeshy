# Présence iOS — passage au push-only (suppression du pull REST bulk)

## Contexte / Problème

Log device instrumenté (item #8 de `tasks/2026-07-12-device-log-priorities.md`) :
`GET /users/presence?ids=<200 ids>` → `network=5118ms decode=98ms total=5217ms size=19430B`, répété
(« Refreshed presence for 200 ids » en boucle).

Root cause (evidence-based, pas hypothèse) :
- `size=19430B` / 200 entrées ≈ 97 octets/entrée, `decode=98ms` → le payload n'est pas le problème.
- `network=5118ms` = temps d'attente serveur pur. Correspond à la chaîne de requêtes Mongo
  **séquentielles** dans `PresenceVisibilityService.resolveForTargets`
  (`services/gateway/src/services/PresenceVisibilityService.ts:82-152` : ~5 aller-retours) +
  `presence.ts:89-98` (2 requêtes supplémentaires).
- Déclenché en boucle car `PresenceManager.swift:66-70` appelle `PresenceService.refreshKnownUsers()`
  sur **chaque** `didReconnect` socket, sans debounce — et se combine avec #11 (churn socket).
- Investigation gateway (lecture seule, agent dédié) : `presence:snapshot`
  (`MeeshySocketIOManager.ts:692-774`, déclenché par `AuthHandler` à *chaque* authentification
  socket réussie) se ré-émet déjà à **chaque reconnect socket réel**. Côté iOS, `didReconnect`
  (`MessageSocketManager.swift:1643-1675`) ne se déclenche que sur un vrai
  `suspendTransport()+connect()` — donc exactement le cas où le serveur va ré-authentifier et
  renvoyer un snapshot frais. Le commentaire iOS qui justifiait le fallback REST (« le snapshot ne
  se ré-émet que sur fresh auth ») est obsolète face au code serveur actuel.
- Conclusion : le pull REST 200-ids duplique un mécanisme push qui fonctionne déjà, via un chemin
  serveur beaucoup plus coûteux (5+ round-trips séquentiels vs 2 requêtes batchées + cache 60s côté
  snapshot).

## Décision

**Approche A — Push-only.** Supprimer entièrement le pull REST bulk côté client iOS. La présence
repose uniquement sur : `presence:snapshot` (resync complet à chaque reconnect réel) + `user:status`
(deltas temps réel) + `typing:start` (bump d'activité local) + la dégradation temporelle douce déjà
en place (online→away à 5min, away→offline à 30min).

Approches écartées :
- **B (filet de sécurité minimal)** : garder un fallback REST rare/borné. Rejeté — complexité
  additionnelle non justifiée tant qu'aucune perte de snapshot n'a été observée en pratique.
- **C (corriger le pull en place)** : POST + chunking + debounce + requêtes gateway parallélisées.
  Rejeté — resterait un doublon plus cher du push pour un gain marginal.

## Scope

**In** : `apps/ios/Meeshy/Features/Main/Services/PresenceManager.swift`,
`PresenceService.swift` (suppression complète), `BackgroundTransitionCoordinator.swift`.

**Out** (confirmé avec l'utilisateur) :
- #11 (churn socket disconnect/reconnect en BG) — sous-système différent, traité séparément.
- #4 / `GET /conversations?limit=500...` (14,5s) — déjà classé « environnemental + volume ».
- Route gateway `GET /users/presence` — **non touchée**, `apps/web/hooks/use-user-status-realtime.ts`
  s'appuie dessus. Seul le client iOS arrête de l'appeler.
- Android — n'a jamais eu ce fallback REST (`apps/android/tasks/audit/part-04.md:529`), non concerné.
- Le bug de troncature non-déterministe (`Array(presenceMap.keys).prefix(200)`) devient sans objet :
  le code qui le contenait disparaît avec `PresenceService`.

## Changements précis

1. `PresenceManager.swift:62-71` — retirer la souscription `MessageSocketManager.shared.didReconnect
   .sink { PresenceService.shared.refreshKnownUsers() }` et son commentaire (obsolète, cf. Contexte).
2. `PresenceManager.swift:176-186` — retirer `ingestRefresh(_:)` (mort après suppression de
   `PresenceService`, seul appelant).
3. `PresenceManager.swift:188-192` — retirer `knownUserIds` (mort, seul consommateur était
   `PresenceService`).
4. `PresenceService.swift` — suppression complète du fichier (plus aucun appelant après 1-3 ; confirmé
   par grep : `PresenceRefreshEntry`/`PresenceRefreshPayload` ne sont référencés nulle part ailleurs).
5. `BackgroundTransitionCoordinator.swift:125-127` — retirer le step
   `withBudget("presence.refresh") { PresenceService.shared.refreshKnownUsers() }` de
   `resumeFromBackground()`.

## Gestion des risques

Risque résiduel : un `presence:snapshot` émis serveur mais perdu en transit (pas d'ack applicatif sur
cet emit Socket.IO). Mitigation : la dégradation temporelle douce déjà en place absorbe ce cas — un
flip manqué dégrade au pire vers `away`/`offline` avec un léger retard, jamais vers un faux `online`
permanent. Aucun report utilisateur de ce symptôme à ce jour.

## Tests

- `PresenceManagerTests.swift` (30 tests existants) doit rester vert **sans modification** — aucun
  test ne référence `PresenceService`/`ingestRefresh`/`knownUserIds` (confirmé par grep). C'est la
  preuve de non-régression : le comportement push (snapshot/status/typing/decay) est inchangé.
- Aucun nouveau test comportemental requis côté `PresenceManager` (son API observable ne change pas).
- `./apps/ios/meeshy.sh build` doit être vert (zéro référence résiduelle à `PresenceService`).
- Vérification device (sonde déjà en place pour ce fichier de tâches) : confirmer qu'aucun
  `GET /users/presence` n'apparaît plus dans le log après un cycle background→foreground avec
  reconnect socket réel.

## Rollback

Revert du commit unique si un test device réel (déjà une étape ouverte du fichier de tâches parent)
montre un contact resté durablement gris après un snapshot manqué en conditions réelles.
