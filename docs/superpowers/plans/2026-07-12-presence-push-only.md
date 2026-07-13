# Présence iOS push-only — suppression du pull REST 200-ids — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supprimer le pull REST bulk `GET /users/presence?ids=<200>` déclenché sur chaque reconnect
socket iOS et sur chaque retour foreground — la présence repose désormais uniquement sur le push déjà
en place (`presence:snapshot` + `user:status` + `typing:start` + dégradation temporelle douce).

**Architecture:** Suppression pure de code mort/redondant sur 3 fichiers couplés (`PresenceManager.swift`,
`PresenceService.swift`, `BackgroundTransitionCoordinator.swift`). Aucune nouvelle interface, aucun
nouveau comportement — le comportement push observable ne change pas, ce qui est prouvé par la suite
`PresenceManagerTests.swift` existante restant verte sans modification.

**Tech Stack:** Swift 6, XCTest, `./apps/ios/meeshy.sh` (build/test wrapper — jamais `xcodebuild`
directement en dev courant, cf. `apps/ios/CLAUDE.md`).

## Global Constraints

- Design de référence : `docs/superpowers/specs/2026-07-12-presence-push-only-design.md`.
- Scope strictement limité à `apps/ios/Meeshy/Features/Main/Services/{PresenceManager,PresenceService,BackgroundTransitionCoordinator}.swift`
  — ne PAS toucher à `services/gateway/src/routes/users/presence.ts` (utilisé par `apps/web`), ni à
  `#11`/`#4` du fichier de tâches parent.
- `./apps/ios/meeshy.sh build` doit être vert avant tout commit (grep le log, pas seulement l'exit code
  — cf. leçon projet `feedback_meeshysh_build_exit0_despite_failure`).
- `./apps/ios/meeshy.sh test` doit rester vert (vérifier via le xcresult, pas l'exit code seul — cf.
  `feedback_meeshysh_test_xcresult_not_exit`).
- Pas de trailer `Co-Authored-By` dans les commits (convention projet).
- `git checkout -- apps/ios/Meeshy/Localizable.xcstrings` avant tout commit iOS si ce fichier a du churn
  (artefact Xcode, pas de contenu réel modifié par ce plan).

---

### Task 1: Supprimer le pull REST de présence (3 fichiers couplés)

Ces 3 fichiers doivent changer dans le même commit : `PresenceService.swift` est le seul appelant de
`PresenceManager.knownUserIds`/`ingestRefresh`, et `BackgroundTransitionCoordinator.swift` est un
appelant externe de `PresenceService`. Retirer un seul des trois casse la compilation des deux autres —
il n'existe pas de découpage qui compile à l'étape intermédiaire.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/PresenceManager.swift:59-193`
- Delete: `apps/ios/Meeshy/Features/Main/Services/PresenceService.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift:120-127`
- Test (existant, non modifié — sert de preuve de non-régression) :
  `apps/ios/MeeshyTests/Unit/Services/PresenceManagerTests.swift`

**Interfaces:**
- Consumes: rien de nouveau — pas de dépendance amont.
- Produces: rien de nouveau — c'est une suppression pure. L'API publique observable de `PresenceManager`
  (`presenceState(for:)`, `noteActivity(userId:)`, `resolvedState(userId:isOnline:lastActiveAt:)`,
  `ingestSnapshot(_:)`, `seed(from:currentUserId:)`) est inchangée. Aucun autre fichier du repo ne
  référence `PresenceService`, `ingestRefresh`, ou `knownUserIds` (confirmé par grep repo-wide avant
  d'écrire ce plan).

- [ ] **Step 1: Retirer la souscription `didReconnect` (fallback REST) de `PresenceManager.swift`**

Dans `apps/ios/Meeshy/Features/Main/Services/PresenceManager.swift`, supprimer ce bloc (lignes 62-72,
entre le `.store(in: &cancellables)` du listener `typingStarted` et le commentaire `// Keep the
last-known presence snapshot...`) :

```swift
        // After a socket reconnect we may have missed N status flips while we
        // were disconnected. The gateway re-emits `presence:snapshot` only on
        // a fresh auth, so trigger a REST refresh defensively — it covers the
        // case where the transport reconnected without re-auth.
        MessageSocketManager.shared.didReconnect
            .receive(on: DispatchQueue.main)
            .sink { _ in
                PresenceService.shared.refreshKnownUsers()
            }
            .store(in: &cancellables)

```

Ce bloc doit disparaître entièrement (les 2 lignes vides qui l'encadrent doivent se réduire à une
seule, comme partout ailleurs dans ce fichier entre deux souscriptions).

- [ ] **Step 2: Retirer `ingestRefresh(_:)` et `knownUserIds` de `PresenceManager.swift`**

Toujours dans le même fichier, supprimer ce bloc (situé juste avant `deinit`) :

```swift
    /// Apply a bulk REST presence response (no `username` field — see
    /// `PresenceRefreshEntry` in `PresenceService`).
    func ingestRefresh(_ entries: [PresenceRefreshEntry]) {
        guard !entries.isEmpty else { return }
        let updates = Dictionary(
            uniqueKeysWithValues: entries.map { entry in
                (entry.userId, UserPresence(isOnline: entry.isOnline, lastActiveAt: entry.lastActiveAt))
            }
        )
        presenceMap.merge(updates) { _, newEntry in newEntry }
    }

    /// The set of userIds we currently track. Used by `PresenceService` to build
    /// the `?ids=` query for the REST refresh on foreground/reconnect.
    var knownUserIds: [String] {
        Array(presenceMap.keys)
    }

```

Et corriger le commentaire de `ingestSnapshot(_:)` juste au-dessus, qui mentionne à tort un usage REST
qui n'existera plus. Remplacer :

```swift
    /// Apply a bulk presence snapshot. Used by:
    /// - the `presence:snapshot` socket event right after auth
    /// - the REST `/users/presence` refresh on foreground/reconnect
    ///
    /// Each entry replaces the local presence row for that userId so a contact
    /// that was online in our cache but is now offline server-side gets corrected
    /// (closes the "stale online forever" failure mode).
    func ingestSnapshot(_ users: [UserStatusEvent]) {
```

par :

```swift
    /// Apply a bulk presence snapshot received via the `presence:snapshot` socket
    /// event — sent right after auth, and re-sent on every reconnect since the
    /// gateway re-authenticates on each new socket connection.
    ///
    /// Each entry replaces the local presence row for that userId so a contact
    /// that was online in our cache but is now offline server-side gets corrected
    /// (closes the "stale online forever" failure mode).
    func ingestSnapshot(_ users: [UserStatusEvent]) {
```

- [ ] **Step 3: Supprimer `PresenceService.swift`**

```bash
git rm apps/ios/Meeshy/Features/Main/Services/PresenceService.swift
```

- [ ] **Step 4: Retirer le step `presence.refresh` de `BackgroundTransitionCoordinator.swift`**

Dans `apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift`, dans
`resumeFromBackground()`, supprimer ce bloc (entre la fermeture du `withBudget("sockets.resume")` et
le `withBudget("audio.resume")`) :

```swift
        // Sync presence dots with the gateway runtime state. We may have missed
        // `user:status` events while suspended, and `presence:snapshot` only
        // fires on the next socket auth — which can lag by a few seconds after
        // the resume. This REST refresh closes the gap so the conversation
        // list lights up correctly the instant the user looks at it.
        await withBudget("presence.refresh") {
            PresenceService.shared.refreshKnownUsers()
        }
```

Résultat attendu juste après le `}` qui ferme `sockets.resume` :

```swift
        await withBudget("audio.resume") {
            await MediaLifecycleBridge.shared.resumeFromBackground()
        }
```

- [ ] **Step 5: Vérifier qu'aucune référence résiduelle ne subsiste**

```bash
grep -rn "PresenceService\|ingestRefresh\|knownUserIds\|PresenceRefreshEntry\|PresenceRefreshPayload" \
  apps/ios/Meeshy apps/ios/MeeshyTests --include="*.swift"
```

Expected: aucune sortie (0 match).

- [ ] **Step 6: Build**

```bash
./apps/ios/meeshy.sh build
```

Expected: `BUILD SUCCEEDED` dans le log (grep-le explicitement, ne pas se fier au seul exit code — cf.
`feedback_meeshysh_build_exit0_despite_failure`). Aucune erreur de compilation liée à un symbole
manquant.

- [ ] **Step 7: Run de la suite complète (preuve de non-régression)**

```bash
./apps/ios/meeshy.sh test
```

Expected : les 3 phases passent, en particulier `PresenceManagerTests` (30 tests, phase 1 — suites
isolées) reste intégralement vert, sans qu'aucun de ses tests n'ait été modifié. Vérifier le résultat
via le xcresult produit (`test-results/phase1-isolated.xcresult` et non le seul exit code — cf.
`feedback_meeshysh_test_xcresult_not_exit`).

- [ ] **Step 8: Commit**

```bash
git checkout -- apps/ios/Meeshy/Localizable.xcstrings 2>/dev/null || true
git add apps/ios/Meeshy/Features/Main/Services/PresenceManager.swift \
        apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift
git status --short  # confirme la suppression de PresenceService.swift (déjà `git rm`-é au Step 3)
git commit -m "$(cat <<'EOF'
refactor(ios/presence): supprime le pull REST 200-ids — push-only (#8)

presence:snapshot se ré-émet déjà à chaque reconnect socket réel (le
gateway ré-authentifie sur chaque nouvelle connexion) : le pull REST
dupliquait ce mécanisme via un chemin gateway ~5x plus coûteux
(network=5118ms observé pour 200 ids, cf. design doc). Supprime
PresenceService.swift, la souscription didReconnect côté
PresenceManager, et le step presence.refresh du resume BG.
EOF
)"
```

---

### Task 2: Documenter la résolution dans le fichier de tâches parent

**Files:**
- Modify: `tasks/2026-07-12-device-log-priorities.md` (racine du repo, PAS le worktree — ce fichier
  n'existe que sur `main`/racine, cf. investigation initiale)

**Interfaces:**
- Consumes: le hash de commit produit par Task 1, Step 8.
- Produces: rien (docs only).

- [ ] **Step 1: Cocher l'item #8 et ajouter la note de résolution**

Remplacer dans `tasks/2026-07-12-device-log-priorities.md` :

```markdown
- [ ] **#8 — Presence : 200 ids dans UNE URL géante (5,1 s, fragile)**
  Evidence : `GET /users/presence?ids=<200 ids> network=5118ms`, `Refreshed presence for 200 ids` en boucle.
  Hypothèse : URL énorme (limite de longueur, fragile) + requête lente.
  Fichiers : `PresenceManager` (fetch presence).
  Fix piste : chunker (ex. 50/req) ou passer en POST body ; borner la fréquence de refresh.
```

par (remplacer `<HASH>` par le hash réel du commit de Task 1) :

```markdown
- [x] **#8 — Presence : 200 ids dans UNE URL géante (5,1 s, fragile)** — `<HASH>`
  Cause prouvée : `network=5118ms` était un temps d'attente serveur pur (`decode=98ms`, payload
  19KB négligeable), dû à la chaîne séquentielle de `PresenceVisibilityService.resolveForTargets`
  (~5 aller-retours Mongo). Investigation gateway (agent dédié) : `presence:snapshot` se ré-émet déjà
  à chaque reconnect socket réel (ré-auth systématique côté `MeeshySocketIOManager`/`AuthHandler`) —
  le pull REST dupliquait un mécanisme push qui fonctionnait déjà, en plus cher. **Fix retenu : push-only**
  (pas de chunking/POST) — suppression complète de `PresenceService.swift` + du trigger `didReconnect`
  + du step `presence.refresh` au resume BG. Design : `docs/superpowers/specs/2026-07-12-presence-push-only-design.md`.
  Route gateway `GET /users/presence` conservée (utilisée par `apps/web`). Suite `PresenceManagerTests`
  (30 tests) verte sans modification — preuve de non-régression du comportement push. Reste ouvert :
  vérification device réelle (aucun `GET /users/presence` dans le log après un cycle BG→FG avec reconnect).
```

- [ ] **Step 2: Ajouter une ligne au Journal**

À la fin du fichier, dans la section `## Journal`, ajouter :

```markdown
- 2026-07-12 : #8 livré `<HASH>` — presence passée push-only (suppression du pull REST 200-ids,
  redondant avec `presence:snapshot` qui se ré-émet déjà à chaque reconnect réel). Design doc +
  plan sous `docs/superpowers/specs/` et `docs/superpowers/plans/`.
```

- [ ] **Step 3: Commit**

```bash
git add tasks/2026-07-12-device-log-priorities.md
git commit -m "$(cat <<'EOF'
docs(tasks): #8 livré (<HASH>) — présence push-only, pull REST supprimé
EOF
)"
```

---

## Self-Review

1. **Spec coverage** : le design (`2026-07-12-presence-push-only-design.md`) liste 5 changements précis
   — les 5 sont couverts par Task 1 Steps 1-4. Le scope "out" (gateway, web, Android, #11, #4) n'est
   touché par aucun step. Les tests requis par le design (suite existante verte, build vert) sont
   couverts par Task 1 Steps 6-7.
2. **Placeholder scan** : aucun `TBD`/`TODO` ; le seul `<HASH>` est un placeholder intentionnel et
   documenté (résolu mécaniquement à l'exécution de Task 2, après que Task 1 a produit le hash réel).
3. **Type consistency** : aucune nouvelle interface introduite — la suppression ne touche à aucune
   signature consommée ailleurs (confirmé par grep repo-wide dans le design doc).
