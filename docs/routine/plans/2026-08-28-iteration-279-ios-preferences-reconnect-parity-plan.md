# Plan — Itération 279 : iOS relit ses préférences à la reconnexion socket

Issue #4231 · analyse `2026-08-28-iteration-279-ios-preferences-reconnect-parity-analyse.md`.

## Objectifs

Donner au double des préférences user-level iOS sa seconde source PÉRENNE (la
reconnexion socket), à parité d'Android (#4197) et du web (#4209). Réutiliser
`fetchFromBackend()` et son veto `pendingCategories` ; mirroiter le seam
d'injection déjà testé de `observeRemotePreferenceBroadcast`.

## Modules affectés

- `packages/MeeshySDK/Sources/MeeshySDK/Services/UserPreferencesManager.swift`
  (production : deux méthodes + un appel `init()`).
- `packages/MeeshySDK/Tests/MeeshySDKTests/Services/UserPreferencesManagerTests.swift`
  (témoins).

## Phases d'implémentation

1. **RED** — ajouter trois tests dans `UserPreferencesManagerTests`, poussant un
   `PassthroughSubject<Void, Never>` dans le nouveau seam `observeSocketReconnection(_:)` :
   relecture, veto écho pending, garde d'auth.
2. **GREEN** — ajouter dans `UserPreferencesManager` :
   - `private func observeSocketReconnection()` délégant à l'injectable avec
     `MessageSocketManager.shared.didReconnect.eraseToAnyPublisher()` ;
   - `internal func observeSocketReconnection(_ publisher: AnyPublisher<Void, Never>)`
     qui `sink { Task { await fetchFromBackend() } }`, `.store(in: &cancellables)` ;
   - appeler `observeSocketReconnection()` dans `init()` après
     `observeRemotePreferenceBroadcast()`.
3. **REFACTOR** — doc-comment situant le quatrième déclencheur (PÉRENNE de
   reconnexion) face aux trois existants ; nommer la parité #4197/#4209.

## Dépendances

Aucune nouvelle. `MessageSocketManager.shared.didReconnect` et
`fetchFromBackend()`/`applyRemote`/`pendingCategories` existent déjà.

## Risques estimés

Faible. Aucune API publique modifiée. Le seul chemin nouveau est un `sink` qui
réutilise une fonction déjà gardée sur trois axes (auth, veto, échec réseau).
`didReconnect` ne fire que sur reconnexion réelle (garde `hadPreviousConnection`).

## Stratégie de rollback

Retrait de l'appel `observeSocketReconnection()` dans `init()` (un ligne) suffit
à désarmer le déclencheur ; le reste est du code mort inoffensif.

## Critères de validation

- 3 témoins verts (relecture, veto, auth) via le seam d'injection.
- Compile SDK sous Swift 6.2.
- `sdk-tests.yml` vert en CI (la suite Swift ne tourne pas sous Linux — validée
  via CI sur la PR).

## Statut de complétion

- [x] RED : 3 témoins écrits dans `UserPreferencesManagerTests` (seam d'injection).
- [x] GREEN : `observeSocketReconnection()` + injectable, appelé en `init()`.
- [x] REFACTOR : doc-comment situant le quatrième déclencheur (PÉRENNE), parité #4197/#4209.
- [ ] Push + PR + CI verte (la suite Swift ne tourne pas sous Linux — `sdk-tests.yml` en CI).

Note environnement : aucun toolchain Swift dans l'environnement Linux de la
routine ; la production et les témoins sont revus statiquement contre le motif
DÉJÀ TESTÉ de `observeRemotePreferenceBroadcast` (même seam, même corps de sink,
`fetchFromBackend` réutilisé), et validés par `sdk-tests.yml` sur la PR.

## Suivi / améliorations futures (hors scope, à instruire en issue)

- Survey `packages/shared` (itération 279) — trois pistes non-prism repérées,
  à instruire séparément : divergence `ReactionSchemas.add` vs SSOT `isValidEmoji`
  (latente), regex de nom admettant `\n` au bord register, garde 8KB metadata en
  unités UTF-16. La plus propre et locale : la première.
