# Partage de position — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger le crash survenant après l'octroi de l'autorisation de localisation, puis rendre le partage de position durable et lisible en message, commentaire, post et story.

**Architecture:** Un modèle de valeur unique `SharedPlace` (SDK Swift) voyage du picker jusqu'au serveur dans un champ de requête dédié `location` ; le serveur seul l'écrit dans `metadata.location` (Prisma `Json?`, aucune migration) et le hisse en champ top-level à la lecture, exactement comme `metadata.postReplyTo` → `postReplyTo`. Côté iOS, il est mis en cache GRDB, rendu par `LocationMessageView` étendu, et posé dans une story comme pastille dessinée par `StoryRenderer`.

**Tech Stack:** Swift 6 / SwiftUI / CoreLocation / MapKit / GRDB (iOS), TypeScript / Fastify / Socket.IO / Prisma-MongoDB (gateway), XCTest et Jest.

**Spec:** `docs/superpowers/specs/2026-07-29-partage-position-design.md`

## Global Constraints

- Le target app compile sous `SWIFT_VERSION: 6.0` et `SWIFT_DEFAULT_ACTOR_ISOLATION: MainActor` (`apps/ios/project.yml:9,28`). Le target `MeeshySDK` core est `nonisolated`, `MeeshyUI` est `MainActor`.
- `./apps/ios/meeshy.sh test` doit passer avant tout commit touchant iOS (`CLAUDE.md:132`).
- Gateway : `bun test` via `jest --config=jest.config.json`, **et** `tsc` séparément — les tests ne remplacent pas le typecheck.
- Aucun trailer `Co-Authored-By` ni mention d'outil dans les messages de commit.
- Toute chaîne affichée passe par un catalogue : `bundle: .module` pour MeeshyUI (`packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings`), `bundle: .main` pour l'app (`apps/ios/Meeshy/Localizable.xcstrings`). Une clé absente rend le `defaultValue` français muet dans les autres langues.
- Tout champ Prisma lu par un resolver doit figurer dans son `select`.
- Les correctifs de la Phase 1 sont commités **séparément**, un par tâche : le crash est corrigé sans trace, chaque correctif doit rester attribuable.
- Ne jamais retirer un effet visuel existant (glass, ombre, dégradé) en refactorant.

## Décision requise avant la Tâche 8

**Position en conversation chiffrée.** `Message` porte `encryptedContent`/`isEncrypted` (`packages/shared/prisma/schema.prisma:661-672`). Une position stockée en clair dans `metadata.location` reste lisible par le serveur, y compris en conversation E2EE. Trois issues : (a) l'accepter et le documenter, (b) refuser le partage de position en conversation chiffrée, (c) chiffrer le bloc comme le contenu. **Demander l'arbitrage avant d'implémenter la Tâche 8.** Les tâches 1 à 7 n'en dépendent pas.

## Structure des fichiers

| Fichier | Responsabilité | Phase |
|---|---|---|
| `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveMap.swift` | identité d'annotation stable | 1 |
| `apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift` | picker + modèle désisolé + breadcrumbs | 1 |
| `packages/MeeshySDK/Sources/MeeshySDK/Networking/ClientInfoProvider.swift` | en-têtes géo, chemin réveillé par l'octroi | 1 |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/SharedPlace.swift` *(créer)* | modèle de valeur unique | 2 |
| `services/gateway/src/services/location/sharedPlace.ts` *(créer)* | validation + hoist serveur | 2 |
| `services/gateway/src/routes/conversations/messages.ts`, `socketio/handlers/MessageHandler.ts`, `services/messaging/MessageProcessor.ts` | écriture + hoist message | 2 |
| `services/gateway/src/routes/posts/core.ts`, `routes/posts/comments.ts` | écriture + hoist post et commentaire | 2 |
| `packages/MeeshySDK/Sources/MeeshyUI/Location/LocationMessageView.swift` | rendu unique d'un lieu | 3 |
| `apps/ios/.../ConversationView+AttachmentHandlers.swift`, `FeedView+Attachments.swift`, `FeedCommentsSheet.swift` | les 4 call sites + les 2 publications | 3 |
| `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord*.swift`, `PostRecord.swift`, `CommentRecord.swift`, `*DatabaseMigrations.swift` | cache local | 4 |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`, `MeeshyUI/Story/Canvas/StoryRenderer.swift` | pastille de story | 5 |

---

# Phase 1 — Le crash

Livrable autonome : ne dépend d'aucune autre phase, et peut partir en production seul.

## Task 1: Identité d'annotation stable

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveMap.swift:197-200`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Location/LocationMessageView.swift:196-199`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Compatibility/AdaptivePagingMapTests.swift`

**Interfaces:**
- Produces: `PinItem(coordinate:)` dont `id` est dérivé des coordonnées, stable entre deux constructions identiques.

Contexte : `PinItem` fabrique `let id = UUID()`, donc une identité neuve à chaque rendu. Sur iOS 16, `onChange(of: RegionKey(region))` tire en continu pendant une animation de région ; l'annotation est alors détruite et recréée à chaque frame sur le `Map(coordinateRegion:)` déprécié.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `AdaptivePagingMapTests.swift` :

```swift
func test_pinItem_identityIsDerivedFromCoordinate_notRandom() {
    let coord = CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522)
    let a = PinItem(coordinate: coord)
    let b = PinItem(coordinate: coord)
    XCTAssertEqual(a.id, b.id,
                   "Deux pins sur le même point doivent partager leur identité : une identité aléatoire fait recréer l'annotation à chaque rendu.")

    let elsewhere = PinItem(coordinate: CLLocationCoordinate2D(latitude: 45.75, longitude: 4.85))
    XCTAssertNotEqual(a.id, elsewhere.id, "Deux points distincts doivent rester distinguables.")
}
```

`PinItem` est `private` : le rendre `internal` dans `AdaptiveMap.swift` (retirer `private` devant `struct PinItem`) pour que le test du même module y accède.

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — `XCTAssertEqual failed` sur les deux `id` distincts.

- [ ] **Step 3: Implémenter**

Dans `AdaptiveMap.swift`, remplacer :

```swift
private struct PinItem: Identifiable {
    let id = UUID()
    let coordinate: CLLocationCoordinate2D
}
```

par :

```swift
/// Identité dérivée des coordonnées, PAS un `UUID()` neuf à chaque
/// construction : `annotationItems` est reconstruit à chaque rendu, et sur
/// iOS 16 `onChange(of: RegionKey(region))` tire en continu pendant une
/// animation de région. Une identité aléatoire faisait donc détruire et
/// recréer l'annotation à chaque frame. Même parade que le cache d'items de
/// `LocationFullscreenView`.
struct PinItem: Identifiable {
    let coordinate: CLLocationCoordinate2D
    var id: String { "\(coordinate.latitude),\(coordinate.longitude)" }
}
```

Appliquer la même transformation à `LocationAnnotationItem` dans `LocationMessageView.swift:196-199` :

```swift
struct LocationAnnotationItem: Identifiable {
    let coordinate: CLLocationCoordinate2D
    var id: String { "\(coordinate.latitude),\(coordinate.longitude)" }
}
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveMap.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Location/LocationMessageView.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Compatibility/AdaptivePagingMapTests.swift
git commit -m "fix(sdk/map): l'identite d'une annotation derive du point, pas d'un UUID neuf a chaque rendu"
```

## Task 2: Désisoler `LocationPickerModel`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift:331-465`
- Test: `apps/ios/MeeshyTests/Unit/Services/PermissionGateSourceGuardTests.swift`

**Interfaces:**
- Produces: `LocationPickerModel` déclaré `nonisolated final class … : NSObject, ObservableObject, CLLocationManagerDelegate, @unchecked Sendable`, avec six propriétés publiant via `willSet { objectWillChange.send() }`.

Contexte : la classe est `@MainActor` sans `deinit` écrite, dans un target `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`. Swift 6.2 lui donne une deinit isolée, dont le shim de rétro-déploiement double-libère le scope task-local et tue le processus au démontage. Précédent : `ScrollOffsetRelay.swift:37-51`.

Le dépliage seul ne suffit pas : la classe a six captures cross-isolation, qui cessent de compiler dès que le type devient non-Sendable. Le patron applicable est celui du jumeau NSObject + delegate `PiPVideoRenderer.swift:25`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `PermissionGateSourceGuardTests.swift` :

```swift
/// Une classe `@MainActor` sans `deinit` écrite reçoit une deinit ISOLÉE
/// (SE-0466) dont le shim de rétro-déploiement double-libère le scope
/// task-local et tue le processus au démontage. Le picker étant une sheet,
/// ce chemin est exercé à chaque fermeture. Même signature que le crash
/// `ScrollOffsetRelay`.
func test_locationPickerModel_isTypeLevelNonisolated() throws {
    let src = try source("Meeshy/Features/Main/Components/LocationPickerView.swift")

    XCTAssertTrue(src.contains("nonisolated final class LocationPickerModel"),
                  "Le `nonisolated` doit vivre sur le TYPE : c'est la seule annotation qui désisole la deinit.")
    XCTAssertTrue(src.contains("@unchecked Sendable"),
                  "Un type nonisolated capturé dans des fermetures de delegate doit être Sendable.")
    XCTAssertFalse(src.contains("@Published var selectedCoordinate"),
                   "`nonisolated` est refusé sur une propriété enveloppée : les @Published doivent être dépliés.")
    XCTAssertTrue(src.contains("willSet { objectWillChange.send() }"),
                  "Le dépliage doit publier sur willSet, exactement comme @Published.")
}
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — `nonisolated final class LocationPickerModel` introuvable.

- [ ] **Step 3: Implémenter**

Remplacer la déclaration et les six propriétés publiées :

```swift
/// `nonisolated` sur le TYPE + `@unchecked Sendable`.
///
/// Sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, un `@MainActor` sans
/// `deinit` écrite reçoit une deinit ISOLÉE (SE-0466) : son shim de
/// rétro-déploiement double-libère le scope task-local et tue le processus
/// au démontage de la sheet. Voir `ScrollOffsetRelay`.
///
/// `@unchecked Sendable` est requis parce que les six fermetures de delegate
/// et de complétion capturent `self` depuis un contexte nonisolated. Ce n'est
/// pas une échappatoire : l'invariant est vérifié — `CLLocationManager` est
/// créé sur le main donc rappelle sur le main ; `CLGeocoder` et
/// `MKLocalSearch` documentent une complétion sur le main. Même patron que
/// `PiPVideoRenderer`.
nonisolated final class LocationPickerModel: NSObject, ObservableObject, CLLocationManagerDelegate, @unchecked Sendable {
    /// `willSet { objectWillChange.send() }` PLUTÔT que `@Published` : le
    /// compilateur refuse `nonisolated` sur une propriété enveloppée, et
    /// l'annotation doit vivre sur le type pour désisoler la deinit. C'est
    /// exactement ce que `@Published` fait — publier avant l'écriture.
    var selectedCoordinate: CLLocationCoordinate2D? { willSet { objectWillChange.send() } }
    var addressString: String? { willSet { objectWillChange.send() } }
    var isGeocoding = false { willSet { objectWillChange.send() } }
    var searchResults: [MKMapItem] = [] { willSet { objectWillChange.send() } }
    var userLocation: CLLocationCoordinate2D? { willSet { objectWillChange.send() } }
    private(set) var authorization: CLAuthorizationStatus = .notDetermined {
        willSet { objectWillChange.send() }
    }
```

Une propriété optionnelle sans valeur initiale explicite doit être écrite `var selectedCoordinate: CLLocationCoordinate2D? = nil { willSet … }` si le compilateur réclame l'initialiseur.

Retirer ensuite `@MainActor` de la déclaration et les annotations `nonisolated` devenues redondantes sur les trois méthodes de delegate (`locationManager(_:didUpdateLocations:)`, `locationManager(_:didFailWithError:)`, `locationManagerDidChangeAuthorization(_:)`) — le type entier l'est désormais.

Les hops `Task { @MainActor [weak self] in … }` restent en place : ils sont maintenant légaux car le type est `Sendable`.

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Prouver la disparition de la deinit isolée**

```bash
xcrun nm -a apps/ios/Build/Build/Products/Debug-iphonesimulator/Meeshy.app/Meeshy \
  | grep -i deinitOnExecutor || echo "aucune deinit isolee residuelle"
```

Expected: aucun symbole `swift_task_deinitOnExecutorMainActorBackDeploy` attribuable à `LocationPickerModel`. Si le symbole persiste, une autre classe du target le porte : le noter, ne pas élargir cette tâche.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift \
        apps/ios/MeeshyTests/Unit/Services/PermissionGateSourceGuardTests.swift
git commit -m "fix(ios/location): le modele du picker est nonisolated, sa deinit ne double-libere plus au demontage"
```

## Task 3: Auditer le chemin réveillé par l'octroi

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Networking/ClientInfoProvider.swift:84-114`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/LocationModelsTests.swift`

**Interfaces:**
- Produces: `enrichWithLocation` réutilisant un `CLLocationManager` unique et respectant un TTL négatif.

Contexte : le garde `status == .authorizedWhenInUse` (`:96`) était **toujours faux** avant l'octroi. Dès l'autorisation accordée, ce code s'active pour la première fois et à **chaque requête API** : un `CLLocationManager` neuf dans un `MainActor.run`, puis un `CLGeocoder` neuf. C'est le seul code que l'octroi réveille globalement, hors du picker — donc le seul dont le réveil coïncide exactement avec le symptôme rapporté.

Deux défauts : un manager instancié par requête (CoreLocation attend une instance durable rattachée à une runloop), et aucun cache négatif — un échec de géocodage relance le cycle complet à la requête suivante.

- [ ] **Step 1: Écrire le test qui échoue**

```swift
func test_clientInfoProvider_reusesASingleLocationManager() throws {
    let root = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent()
    let src = try String(
        contentsOf: root.appendingPathComponent("Sources/MeeshySDK/Networking/ClientInfoProvider.swift"),
        encoding: .utf8)

    let body = src.components(separatedBy: "func enrichWithLocation")[1]
    XCTAssertFalse(body.contains("CLLocationManager()"),
                   "Un manager par requête API : CoreLocation attend une instance durable, pas une instance jetable créée à chaque appel.")
    XCTAssertTrue(src.contains("geoCacheExpiry = Date().addingTimeInterval("),
                  "Un échec doit poser un TTL négatif, sinon le cycle repart à chaque requête.")
}
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — `CLLocationManager()` présent dans le corps de `enrichWithLocation`.

- [ ] **Step 3: Implémenter**

Hisser le manager en propriété du type et poser un cache négatif :

```swift
    /// Instance unique et durable. Une instance jetable par requête API était
    /// créée à chaque appel dès que l'autorisation passait à « accordée » —
    /// jusque-là le garde sortait toujours en amont, et ce chemin ne
    /// s'exécutait jamais. CoreLocation attend un manager rattaché à une
    /// runloop, pas un objet éphémère.
    private let geoManager = CLLocationManager()

    private func enrichWithLocation(_ headers: inout [String: String]) async {
        if Date() < geoCacheExpiry, let city = cachedCity {
            headers["X-Meeshy-City"] = city
            if let region = cachedRegion { headers["X-Meeshy-Region"] = region }
            return
        }

        let locationResult: CLLocation? = await MainActor.run { [geoManager] in
            let status = geoManager.authorizationStatus
            guard status == .authorizedWhenInUse || status == .authorizedAlways else { return nil }
            return geoManager.location
        }
        guard let location = locationResult else {
            // Cache négatif : sans lui, chaque requête API relance un cycle
            // CoreLocation complet dès que l'autorisation est accordée mais
            // qu'aucun relevé n'est encore disponible.
            geoCacheExpiry = Date().addingTimeInterval(300)
            return
        }
        // … suite inchangée
```

Si `geoManager` est déclaré dans un type nonisolated, le capturer explicitement dans la liste de capture du `MainActor.run` comme ci-dessus.

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Networking/ClientInfoProvider.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Models/LocationModelsTests.swift
git commit -m "fix(sdk/net): un seul CLLocationManager pour les en-tetes geo, et un cache negatif"
```

## Task 4: Une seule requête de relevé en vol

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift:364-374,428-465`
- Test: `apps/ios/MeeshyTests/Unit/Services/PermissionGateSourceGuardTests.swift`

**Interfaces:**
- Consumes: `LocationPickerModel` désisolé (Task 2).
- Produces: `LocationPickerModel.isAwaitingFix: Bool`, remis à `false` par `didUpdateLocations` et `didFailWithError`.

Contexte : quand le picker s'ouvre **déjà autorisé**, `requestPermission()` (`:370`) et le callback initial déclenché par l'assignation du delegate tirent chacun un `requestLocation()`. CoreLocation annule alors la première et répond `kCLErrorLocationUnknown` — l'UI attend un relevé qui n'arrivera pas. (Sur un octroi frais, un seul relevé part : ce correctif ne peut pas être le crash, il corrige un blocage distinct.)

- [ ] **Step 1: Écrire le test qui échoue**

```swift
func test_locationPicker_guardsAgainstConcurrentFixRequests() throws {
    let src = try source("Meeshy/Features/Main/Components/LocationPickerView.swift")
    XCTAssertTrue(src.contains("isAwaitingFix"),
                  "Deux requestLocation() concurrents font annuler la premiere par CoreLocation, qui repond kCLErrorLocationUnknown.")
    let fail = try body(from: "func locationManager(_ manager: CLLocationManager, didFailWithError",
                        to: "nonisolated func locationManagerDidChangeAuthorization", in: src)
    XCTAssertTrue(fail.contains("isAwaitingFix = false"),
                  "Un echec doit rearmer la garde, sinon plus aucun releve ne peut partir.")
}
```

Si l'`endMarker` a changé après la Task 2 (les `nonisolated` par méthode ont été retirés), utiliser `to: "func locationManagerDidChangeAuthorization"`.

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — `isAwaitingFix` introuvable.

- [ ] **Step 3: Implémenter**

```swift
    /// Garde contre deux relevés concurrents. À l'ouverture d'un picker déjà
    /// autorisé, `requestPermission()` et le callback d'autorisation initial
    /// tiraient chacun : CoreLocation annulait alors la première requête et
    /// répondait `kCLErrorLocationUnknown`, laissant l'UI en attente.
    private var isAwaitingFix = false

    private func requestFixIfIdle() {
        guard !isAwaitingFix else { return }
        isAwaitingFix = true
        manager.requestLocation()
    }
```

Remplacer les trois appels directs `manager.requestLocation()` (dans `requestPermission()`, `centerOnUser()`, `locationManagerDidChangeAuthorization`) par `requestFixIfIdle()`, et remettre `isAwaitingFix = false` en tête de `didUpdateLocations` et de `didFailWithError`.

Dans `locationManagerDidChangeAuthorization`, l'appel se fait sur `self`, pas sur le paramètre `manager` masquant.

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift \
        apps/ios/MeeshyTests/Unit/Services/PermissionGateSourceGuardTests.swift
git commit -m "fix(ios/location): un seul releve en vol, un echec rearme la garde"
```

## Task 4b: Assignation tardive du delegate

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift:350-374`
- Test: `apps/ios/MeeshyTests/Unit/Services/PermissionGateSourceGuardTests.swift`

**Interfaces:**
- Consumes: `LocationPickerModel` désisolé (Task 2), `requestFixIfIdle()` (Task 4).
- Produces: `init()` sans effet de bord CoreLocation ; l'assignation du delegate migre dans `requestPermission()`.

Contexte : CoreLocation délivre un callback d'autorisation dès l'assignation du delegate — asynchroniquement sur la runloop, pas pendant `init()`. Le risque réel est donc un avertissement « Publishing changes from within view updates », pas un crash. Correctif inoffensif à la justification faible : il est isolé dans son propre commit pour rester attribuable si le crash persiste.

- [ ] **Step 1: Écrire le test qui échoue**

```swift
func test_locationPickerModel_doesNotWireCoreLocationFromInit() throws {
    let src = try source("Meeshy/Features/Main/Components/LocationPickerView.swift")
    let initBody = try body(from: "override init() {", to: "func requestPermission()", in: src)
    XCTAssertFalse(initBody.contains("manager.delegate = self"),
                   "Assigner le delegate depuis init() declenche un callback d'autorisation avant que le @StateObject soit installe.")
    let request = try body(from: "func requestPermission() {", to: "func updateSelectedLocation", in: src)
    XCTAssertTrue(request.contains("manager.delegate = self"),
                  "Le cablage doit se faire au premier usage, de maniere idempotente.")
}
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — `manager.delegate = self` encore présent dans `init()`.

- [ ] **Step 3: Implémenter**

```swift
    override init() {
        super.init()
        manager.desiredAccuracy = kCLLocationAccuracyBest
        authorization = manager.authorizationStatus
    }

    /// Appelé à l'ouverture du picker, donc APRÈS le tap explicite sur
    /// « Localisation ». Le delegate est câblé ici et non dans `init()` :
    /// CoreLocation émet un callback d'autorisation dès l'assignation, et le
    /// recevoir avant que SwiftUI ait installé le `@StateObject` publie une
    /// modification en plein cycle de rendu.
    func requestPermission() {
        if manager.delegate == nil { manager.delegate = self }
        authorization = manager.authorizationStatus
        switch authorization {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            requestFixIfIdle()
        default:
            break
        }
    }
```

Le test de garde existant `test_locationPicker_doesNotRequestLocationWhenUnauthorized` (`:189-199`) attend `case .authorizedWhenInUse, .authorizedAlways:` et `manager.requestWhenInUseAuthorization()` : les deux marqueurs sont conservés ci-dessus. Vérifier qu'il reste vert.

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS, y compris le garde `test_locationPicker_doesNotRequestLocationWhenUnauthorized`.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift \
        apps/ios/MeeshyTests/Unit/Services/PermissionGateSourceGuardTests.swift
git commit -m "fix(ios/location): le delegate CoreLocation est cable au premier usage, pas depuis init"
```

## Task 5: Breadcrumbs du chemin d'autorisation

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift`
- Test: `apps/ios/MeeshyTests/Unit/Services/PermissionGateSourceGuardTests.swift`

**Interfaces:**
- Produces: cinq points de journalisation sur le sous-système `me.meeshy.app`, catégorie `location`.

Contexte : le crash est corrigé sans trace. Ces breadcrumbs sont ce qui rendra un éventuel re-crash diagnosticable au lieu d'imposer une seconde correction à l'aveugle.

- [ ] **Step 1: Écrire le test qui échoue**

```swift
func test_locationPicker_leavesBreadcrumbsOnEveryAuthorizationStep() throws {
    let src = try source("Meeshy/Features/Main/Components/LocationPickerView.swift")
    for step in ["breadcrumb.request", "breadcrumb.authorization", "breadcrumb.fix",
                 "breadcrumb.failure", "breadcrumb.selection"] {
        XCTAssertTrue(src.contains(step),
                      "Etape \(step) non tracee : un re-crash resterait indiagnosticable.")
    }
}
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — aucune des cinq marques n'est présente.

- [ ] **Step 3: Implémenter**

Hisser le logger en propriété du modèle et tracer les cinq étapes :

```swift
    private let log = Logger(subsystem: "me.meeshy.app", category: "location")
```

```swift
    func requestPermission() {
        authorization = manager.authorizationStatus
        log.info("breadcrumb.request status=\(self.authorization.rawValue, privacy: .public)")
        // …
    }
```

```swift
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        log.info("breadcrumb.authorization status=\(status.rawValue, privacy: .public)")
        // …
    }
```

```swift
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        log.info("breadcrumb.fix count=\(locations.count, privacy: .public)")
        // …
    }
```

Dans `didFailWithError`, remplacer le `Logger(...)` construit à la volée par `log.error("breadcrumb.failure \(error.localizedDescription, privacy: .public)")`.

Dans la vue, sous le bouton « Confirmer » (`:288-292`), avant `onSelect` :

```swift
                    Logger(subsystem: "me.meeshy.app", category: "location")
                        .info("breadcrumb.selection hasAddress=\(viewModel.addressString != nil, privacy: .public)")
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift \
        apps/ios/MeeshyTests/Unit/Services/PermissionGateSourceGuardTests.swift
git commit -m "chore(ios/location): cinq breadcrumbs sur le chemin d'autorisation"
```

---

# Phase 2 — Modèle et transport serveur

## Task 6: Le modèle `SharedPlace`

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/SharedPlace.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/LocationModelsTests.swift`

**Interfaces:**
- Produces: `public struct SharedPlace: Codable, Equatable, Sendable` avec `latitude: Double`, `longitude: Double`, `name: String?`, `address: String?`, `category: String?`, `init(latitude:longitude:name:address:category:)` et `var clLocationCoordinate: CLLocationCoordinate2D`.

- [ ] **Step 1: Écrire le test qui échoue**

```swift
func test_sharedPlace_roundTripsThroughJSON() throws {
    let place = SharedPlace(latitude: 48.8566, longitude: 2.3522,
                            name: "Tour Eiffel", address: "Champ de Mars, Paris",
                            category: "landmark")
    let data = try JSONEncoder().encode(place)
    let decoded = try JSONDecoder().decode(SharedPlace.self, from: data)
    XCTAssertEqual(decoded, place)
}

func test_sharedPlace_decodesWithCoordinatesOnly() throws {
    let json = Data(#"{"latitude":48.8566,"longitude":2.3522}"#.utf8)
    let decoded = try JSONDecoder().decode(SharedPlace.self, from: json)
    XCTAssertEqual(decoded.latitude, 48.8566, accuracy: 0.00001)
    XCTAssertNil(decoded.name, "Un point pose a la main n'a pas de nom : les trois champs texte sont optionnels.")
}
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — `cannot find 'SharedPlace' in scope`.

- [ ] **Step 3: Implémenter**

```swift
import Foundation
import CoreLocation

/// Représentation unique d'un lieu partagé, du picker jusqu'au serveur et
/// retour. Un seul type pour les quatre surfaces (message, commentaire, post,
/// story) : les rendus divergeaient auparavant parce que chacune reconstruisait
/// sa propre notion de « position ».
public struct SharedPlace: Codable, Equatable, Sendable {
    public let latitude: Double
    public let longitude: Double
    /// Nom du POI ou du lieu. `nil` pour un point posé à la main dont le
    /// géocodage inverse n'a rien rendu.
    public let name: String?
    public let address: String?
    /// Catégorie MapKit du POI (`MKPointOfInterestCategory.rawValue`).
    public let category: String?

    public init(latitude: Double, longitude: Double,
                name: String? = nil, address: String? = nil, category: String? = nil) {
        self.latitude = latitude
        self.longitude = longitude
        self.name = name
        self.address = address
        self.category = category
    }

    public var clLocationCoordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/SharedPlace.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Models/LocationModelsTests.swift
git commit -m "feat(sdk/location): SharedPlace, representation unique d'un lieu partage"
```

## Task 7: Validation et hoist côté serveur

**Files:**
- Create: `services/gateway/src/services/location/sharedPlace.ts`
- Create: `services/gateway/src/services/location/__tests__/sharedPlace.test.ts`

**Interfaces:**
- Produces: `SharedPlace` (type), `parseSharedPlace(input: unknown): SharedPlace | null`, `sharedPlaceFromMetadata(metadata: unknown): SharedPlace | null`.

Contexte : le patron est celui de `postReplySnapshot.ts:79-88` (`postReplyToFromMetadata`). `parseSharedPlace` valide une entrée **client** ; `sharedPlaceFromMetadata` relit ce que le serveur a écrit.

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
import { parseSharedPlace, sharedPlaceFromMetadata } from '../sharedPlace';

describe('parseSharedPlace', () => {
  it('accepte un lieu complet', () => {
    expect(parseSharedPlace({
      latitude: 48.8566, longitude: 2.3522,
      name: 'Tour Eiffel', address: 'Champ de Mars', category: 'landmark',
    })).toEqual({
      latitude: 48.8566, longitude: 2.3522,
      name: 'Tour Eiffel', address: 'Champ de Mars', category: 'landmark',
    });
  });

  it('accepte les bornes', () => {
    expect(parseSharedPlace({ latitude: -90, longitude: 180 })).not.toBeNull();
  });

  it('rejette hors bornes, NaN et non-nombres', () => {
    expect(parseSharedPlace({ latitude: 90.001, longitude: 0 })).toBeNull();
    expect(parseSharedPlace({ latitude: 0, longitude: -180.001 })).toBeNull();
    expect(parseSharedPlace({ latitude: NaN, longitude: 0 })).toBeNull();
    expect(parseSharedPlace({ latitude: '48' as unknown, longitude: 0 })).toBeNull();
    expect(parseSharedPlace(null)).toBeNull();
    expect(parseSharedPlace([])).toBeNull();
  });

  it('tronque les chaines trop longues au lieu de rejeter', () => {
    const parsed = parseSharedPlace({ latitude: 0, longitude: 0, name: 'x'.repeat(500) });
    expect(parsed!.name!.length).toBe(200);
  });

  it('ignore les champs texte non-chaine', () => {
    expect(parseSharedPlace({ latitude: 0, longitude: 0, name: 42 })!.name).toBeNull();
  });
});

describe('sharedPlaceFromMetadata', () => {
  it('extrait le bloc location', () => {
    expect(sharedPlaceFromMetadata({ location: { latitude: 1, longitude: 2 } }))
      .toMatchObject({ latitude: 1, longitude: 2 });
  });

  it('rend null quand le bloc est absent ou invalide', () => {
    expect(sharedPlaceFromMetadata({})).toBeNull();
    expect(sharedPlaceFromMetadata(null)).toBeNull();
    expect(sharedPlaceFromMetadata({ location: { latitude: 999, longitude: 0 } })).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `cd services/gateway && bun test src/services/location/__tests__/sharedPlace.test.ts`
Expected: FAIL — module `../sharedPlace` introuvable.

- [ ] **Step 3: Implémenter**

```typescript
/**
 * Lieu partagé — validation d'entrée et extraction depuis `metadata`.
 *
 * Le client n'envoie JAMAIS de `metadata` brut : cette enveloppe porte des
 * champs à autorité serveur (postReplyTo, trackingLinks, résumés d'appel)
 * qu'un passthrough permettrait de forger. Les requêtes portent un champ
 * `location` dédié, que `parseSharedPlace` valide et que le serveur seul
 * écrit dans `metadata.location`.
 *
 * Miroir de `postReplySnapshot.ts` pour la relecture.
 */

export interface SharedPlace {
  latitude: number;
  longitude: number;
  name: string | null;
  address: string | null;
  category: string | null;
}

const MAX_TEXT_LENGTH = 200;

function boundedText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, MAX_TEXT_LENGTH);
}

/** `NaN` échoue toute comparaison, ce qui rejette bien les non-nombres. */
function validCoordinates(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' && typeof longitude === 'number' &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180
  );
}

export function parseSharedPlace(input: unknown): SharedPlace | null {
  if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  const obj = input as Record<string, unknown>;
  if (!validCoordinates(obj['latitude'], obj['longitude'])) return null;

  return {
    latitude: obj['latitude'] as number,
    longitude: obj['longitude'] as number,
    name: boundedText(obj['name']),
    address: boundedText(obj['address']),
    category: boundedText(obj['category']),
  };
}

export function sharedPlaceFromMetadata(metadata: unknown): SharedPlace | null {
  if (metadata === null || metadata === undefined || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const obj = metadata as Record<string, unknown>;
  if (!('location' in obj)) return null;
  return parseSharedPlace(obj['location']);
}
```

- [ ] **Step 4: Lancer les tests et le typecheck**

Run: `cd services/gateway && bun test src/services/location/__tests__/sharedPlace.test.ts && bunx tsc --noEmit`
Expected: PASS, aucune erreur de type.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/location/
git commit -m "feat(gateway/location): validation d'un lieu partage et extraction depuis metadata"
```

## Task 8: Écriture et hoist sur le message

> Ne pas commencer avant l'arbitrage E2EE décrit en tête de plan.

**Files:**
- Modify: `services/gateway/src/services/messaging/MessageProcessor.ts:403-416` (voisinage de l'écriture `postReplyTo`)
- Modify: `services/gateway/src/routes/conversations/messages.ts:1318-1319`
- Modify: `services/gateway/src/socketio/handlers/MessageHandler.ts:909-918`
- Test: `services/gateway/src/services/location/__tests__/sharedPlace.test.ts`

**Interfaces:**
- Consumes: `parseSharedPlace`, `sharedPlaceFromMetadata` (Task 7).
- Produces: champ top-level `location` dans les charges message REST et socket.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter au fichier de test de la Task 7 :

```typescript
describe('contrat d entree', () => {
  it('un metadata client brut ne doit jamais etre accepte tel quel', () => {
    // Garde de doctrine : seul `parseSharedPlace` produit le bloc écrit en base.
    const forged = { postReplyTo: { id: 'vole' }, location: { latitude: 1, longitude: 2 } };
    expect(parseSharedPlace(forged)).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `cd services/gateway && bun test src/services/location/__tests__/sharedPlace.test.ts`
Expected: FAIL si `parseSharedPlace` acceptait un objet sans coordonnées top-level. (Il rend déjà `null` : le test doit alors passer immédiatement — c'est une garde de non-régression, la conserver.)

- [ ] **Step 3: Implémenter**

Dans `MessageProcessor.ts`, à l'endroit où `metadata.postReplyTo` est construit, ajouter symétriquement :

```typescript
    const sharedPlace = parseSharedPlace((input as Record<string, unknown>)['location']);
    if (sharedPlace) {
      metadata.location = sharedPlace;
    }
```

Dans `messages.ts` et `MessageHandler.ts`, à côté du hoist `postReplyTo` existant :

```typescript
      const place = sharedPlaceFromMetadata(message.metadata);
      if (place) {
        (messagePayload as Record<string, unknown>).location = place;
      }
```

Vérifier que `metadata` figure dans le `select` Prisma de chaque requête concernée — c'est déjà le cas à `messages.ts:1318`, à confirmer pour le chemin socket.

- [ ] **Step 4: Lancer les tests et le typecheck**

Run: `cd services/gateway && bun test && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/messaging/MessageProcessor.ts \
        services/gateway/src/routes/conversations/messages.ts \
        services/gateway/src/socketio/handlers/MessageHandler.ts \
        services/gateway/src/services/location/__tests__/sharedPlace.test.ts
git commit -m "feat(gateway/message): un message transporte et restitue un lieu partage"
```

## Task 9: Écriture et hoist sur le post et le commentaire

**Files:**
- Modify: `services/gateway/src/routes/posts/core.ts` (les **deux** chemins d'enrichissement, cf. `:23-24` pour `trackingLinks`)
- Modify: `services/gateway/src/routes/posts/comments.ts` (`:21-22`, liste **et** réponse de création)
- Test: `services/gateway/src/services/location/__tests__/sharedPlace.test.ts`

**Interfaces:**
- Consumes: `parseSharedPlace`, `sharedPlaceFromMetadata` (Task 7).
- Produces: champ top-level `location` sur les charges post et commentaire.

Contexte : `trackingLinks` a déjà exigé d'être hissé dans **deux** chemins d'enrichissement de post. Un seul des deux traité laisse la position invisible sur l'autre.

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
it('le meme extracteur sert post et commentaire', () => {
  const metadata = { location: { latitude: 48.85, longitude: 2.35, name: 'Paris' } };
  expect(sharedPlaceFromMetadata(metadata)).toMatchObject({ name: 'Paris' });
});
```

- [ ] **Step 2: Lancer le test, vérifier son état**

Run: `cd services/gateway && bun test src/services/location/__tests__/sharedPlace.test.ts`
Expected: PASS (l'extracteur existe depuis la Task 7). Le travail de cette tâche est le câblage, vérifié à l'étape 4 par un appel réel.

- [ ] **Step 3: Implémenter**

Dans chacun des deux chemins d'enrichissement de `core.ts`, et dans les deux de `comments.ts`, ajouter à côté du traitement `trackingLinks` :

```typescript
    const place = sharedPlaceFromMetadata(post.metadata);
    if (place) {
      (payload as Record<string, unknown>).location = place;
    }
```

À la création (`POST /posts` et `POST /posts/:id/comments`), écrire le bloc validé :

```typescript
    const sharedPlace = parseSharedPlace(request.body['location']);
    const metadata = sharedPlace ? { ...(existingMetadata ?? {}), location: sharedPlace } : existingMetadata;
```

Ajouter `metadata` au `select` Prisma de chaque requête de lecture concernée si absent.

- [ ] **Step 4: Vérifier de bout en bout**

```bash
cd services/gateway && bun test && bunx tsc --noEmit
```

Puis, contre une instance locale, créer un post avec `location` et vérifier que la lecture le restitue :

```bash
curl -s -X POST "$API/posts" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"content":"ici","location":{"latitude":48.8566,"longitude":2.3522,"name":"Tour Eiffel"}}' \
  | jq '.data.location'
```

Expected: le bloc `location` avec `name: "Tour Eiffel"`.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/routes/posts/
git commit -m "feat(gateway/posts): un post et un commentaire transportent et restituent un lieu partage"
```

## Task 10: Décodage `SharedPlace` côté SDK

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift:439` (CodingKeys) et le décodeur associé
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/LocationModelsTests.swift`

**Interfaces:**
- Consumes: `SharedPlace` (Task 6), champ top-level `location` (Tasks 8-9).
- Produces: `APIMessage.location: SharedPlace?`, `APIPost.location: SharedPlace?`, `APIPostComment.location: SharedPlace?`.

Contexte : calquer sur `APIPostReplyTarget` — clé déclarée dans `CodingKeys` (`:439`), décodage par `decodeIfPresent` (`:482`).

- [ ] **Step 1: Écrire le test qui échoue**

```swift
func test_apiMessage_decodesTopLevelLocation() throws {
    let json = Data("""
    {"id":"m1","conversationId":"c1","senderId":"u1","content":"ici",
     "createdAt":"2026-07-29T10:00:00.000Z",
     "location":{"latitude":48.8566,"longitude":2.3522,"name":"Tour Eiffel"}}
    """.utf8)
    let message = try JSONDecoder.meeshy.decode(APIMessage.self, from: json)
    XCTAssertEqual(message.location?.name, "Tour Eiffel")
}

func test_apiMessage_withoutLocationDecodesToNil() throws {
    let json = Data("""
    {"id":"m1","conversationId":"c1","senderId":"u1","content":"ici",
     "createdAt":"2026-07-29T10:00:00.000Z"}
    """.utf8)
    let message = try JSONDecoder.meeshy.decode(APIMessage.self, from: json)
    XCTAssertNil(message.location)
}
```

Remplacer `JSONDecoder.meeshy` par le décodeur configuré réellement utilisé par le SDK pour `APIMessage` (le repérer dans `MessageModels.swift` ou dans le client API) ; les dates ISO exigent sa stratégie.

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — `value of type 'APIMessage' has no member 'location'`.

- [ ] **Step 3: Implémenter**

Dans `APIMessage`, ajouter la propriété, la clé et le décodage :

```swift
    /// Lieu partagé, hissé par le gateway depuis `metadata.location` — même
    /// mécanique que `postReplyTo`. Le SDK ne décode pas `metadata` brut.
    public let location: SharedPlace?
```

```swift
        case pinnedAt, pinnedBy, isViewOnce, isBlurred, expiresAt, location
```

```swift
        location = try c.decodeIfPresent(SharedPlace.self, forKey: .location)
```

Répéter à l'identique sur `APIPost` et `APIPostComment` dans `PostModels.swift`.

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Models/LocationModelsTests.swift
git commit -m "feat(sdk/models): message, post et commentaire decodent un lieu partage"
```

---

# Phase 3 — Surfaces iOS

## Task 11: Le picker rend un `SharedPlace`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift:10,159-215,288-292`
- Test: `apps/ios/MeeshyTests/Unit/Services/PermissionGateSourceGuardTests.swift`

**Interfaces:**
- Consumes: `SharedPlace` (Task 6).
- Produces: `LocationPickerView.onSelect: (SharedPlace) -> Void`, et `LocationPickerModel.selectedPlace: SharedPlace?`.

Contexte : la signature actuelle `(CLLocationCoordinate2D, String?) -> Void` est ce qui fait jeter le lieu aux quatre call sites. La recherche MapKit dispose déjà de `MKMapItem.name` et de `placemark.pointOfInterestCategory`.

- [ ] **Step 1: Écrire le test qui échoue**

```swift
func test_locationPicker_emitsAFullPlace_notBareCoordinates() throws {
    let src = try source("Meeshy/Features/Main/Components/LocationPickerView.swift")
    XCTAssertTrue(src.contains("let onSelect: (SharedPlace) -> Void"),
                  "Le picker doit emettre un lieu complet : la signature (coordonnees, String?) est ce qui faisait jeter le nom.")
    XCTAssertTrue(src.contains("pointOfInterestCategory"),
                  "La categorie POI de MapKit est disponible et doit etre conservee.")
}
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — signature absente.

- [ ] **Step 3: Implémenter**

Dans la vue :

```swift
    let onSelect: (SharedPlace) -> Void
```

Dans le modèle, conserver le nom et la catégorie choisis lors d'une sélection de résultat :

```swift
    var selectedName: String? { willSet { objectWillChange.send() } }
    var selectedCategory: String? { willSet { objectWillChange.send() } }

    /// Lieu complet prêt à être partagé, ou `nil` tant qu'aucun point n'est
    /// choisi. Le nom vient d'un résultat de recherche ; pour un point posé à
    /// la main il reste `nil` et seule l'adresse géocodée est disponible.
    var selectedPlace: SharedPlace? {
        guard let coordinate = selectedCoordinate else { return nil }
        return SharedPlace(latitude: coordinate.latitude, longitude: coordinate.longitude,
                           name: selectedName, address: addressString, category: selectedCategory)
    }
```

Dans le bouton d'un résultat de recherche (`:160-170`), après `updateSelectedLocation(coord)` :

```swift
                    viewModel.selectedName = item.name
                    viewModel.selectedCategory = item.placemark.pointOfInterestCategory?.rawValue
```

Dans `updateSelectedLocation`, remettre `selectedName` et `selectedCategory` à `nil` : déplacer la carte après avoir choisi un POI ne doit pas conserver le nom d'un point qu'on a quitté.

Le bouton « Confirmer » (`:288-292`) devient :

```swift
                Button {
                    guard let place = viewModel.selectedPlace else { return }
                    Logger(subsystem: "me.meeshy.app", category: "location")
                        .info("breadcrumb.selection hasName=\(place.name != nil, privacy: .public)")
                    onSelect(place)
                    HapticFeedback.success()
                    dismiss()
                }
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL à la compilation des quatre call sites — c'est attendu, la Task 12 les met à jour. Si l'exécution en une seule passe est préférée, fusionner les Tasks 11 et 12 en un seul commit.

- [ ] **Step 5: Commit** (après la Task 12, le projet ne compilant pas entre les deux)

## Task 12: Les quatre call sites cessent de jeter le lieu

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift:222`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift:589-599`
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift:1499`
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift:110-120,871,1168-1172`
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet.swift:1140-1145`
- Test: `apps/ios/MeeshyTests/Unit/Services/PermissionGateSourceGuardTests.swift`

**Interfaces:**
- Consumes: `LocationPickerView.onSelect: (SharedPlace) -> Void` (Task 11).
- Produces: un `pendingPlace: SharedPlace?` porté par chaque état de composer.

Contexte : il y a **quatre** call sites et **deux** composers de post distincts. `FeedCommentsSheet` écrit littéralement `{ coordinate, _ in }`.

- [ ] **Step 1: Écrire le test qui échoue**

```swift
/// Le nom du lieu etait jete par les quatre call sites — dont un `{ coordinate, _ in }`
/// litteral. Personne ne l'avait vu parce que rien n'arrivait a destination.
func test_noCallSiteDiscardsThePlace() throws {
    for path in ["Meeshy/Features/Main/Views/ConversationView+Composer.swift",
                 "Meeshy/Features/Main/Views/FeedView.swift",
                 "Meeshy/Features/Main/Views/FeedView+Attachments.swift",
                 "Meeshy/Features/Main/Views/FeedCommentsSheet.swift"] {
        let src = try source(path)
        XCTAssertFalse(src.contains("LocationPickerView(accentColor: accentColor) { coordinate, _ in"),
                       "\(path) jette encore le lieu.")
        XCTAssertFalse(src.contains("coordinate: CLLocationCoordinate2D, address: String?"),
                       "\(path) porte encore la signature qui separait le point de son nom.")
    }
}
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL sur `FeedCommentsSheet.swift` au minimum.

- [ ] **Step 3: Implémenter**

Message — `ConversationView+Composer.swift:222` :

```swift
        .sheet(isPresented: $composerState.showLocationPicker) {
            LocationPickerView(accentColor: accentColor) { place in
                handleLocationSelection(place)
            }
        }
```

`ConversationView+AttachmentHandlers.swift:589` :

```swift
    func handleLocationSelection(_ place: SharedPlace) {
        composerState.pendingPlace = place
        HapticFeedback.light()
    }
```

Ajouter `var pendingPlace: SharedPlace?` à l'état de composer correspondant (`ComposerModels.swift` ou `ConversationStateStore.swift` selon l'emplacement de `pendingAttachments`).

Composer feed inline — `FeedView.swift:1499` et `FeedView+Attachments.swift:110` :

```swift
    func handleFeedLocationSelection(_ place: SharedPlace) {
        pendingPlace = place
        HapticFeedback.light()
    }
```

`FeedComposerSheet` — `FeedView+Attachments.swift:871` et `:1168`, à l'identique avec son propre `pendingPlace`.

Commentaire — `FeedCommentsSheet.swift:1140` :

```swift
        .sheet(isPresented: $showCommentLocationPicker) {
            LocationPickerView(accentColor: accentColor) { place in
                commentPendingPlace = place
                showCommentLocationPicker = false
            }
        }
```

L'attachement `ComposerAttachment.location(lat:lng:)` cesse d'être le véhicule : il ne portait pas le nom et ne pouvait pas être persisté. Retirer son usage des call sites ; conserver le cas d'enum tant que d'anciens brouillons peuvent le contenir.

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ apps/ios/Meeshy/Features/Main/Components/ \
        apps/ios/MeeshyTests/Unit/Services/PermissionGateSourceGuardTests.swift
git commit -m "feat(ios/location): le picker rend un lieu complet, les quatre surfaces cessent de le jeter"
```

## Task 13: Les deux publications de post transportent la position

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift:190-239,1175-1199`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/` (signature de `createPost`)
- Test: `apps/ios/MeeshyTests/Unit/Services/PermissionGateSourceGuardTests.swift`

**Interfaces:**
- Consumes: `pendingPlace` (Task 12), `SharedPlace` (Task 6).
- Produces: `createPost(content:visibility:originalLanguage:location:)`.

Contexte : `publishPost()` (`:1191-1198`) **et** `publishPostWithAttachments()` (`:190-203`) sortent tous deux par `createPost(content:)` seul quand il n'y a pas de fichier. Pire, `guard !text.isEmpty || !pendingAttachments.isEmpty` fait qu'une position seule, sans texte, n'envoie **rien**. Corriger une seule des deux fonctions laisse la moitié du bug.

- [ ] **Step 1: Écrire le test qui échoue**

```swift
func test_bothPublishPathsCarryTheLocation() throws {
    let src = try source("Meeshy/Features/Main/Views/FeedView+Attachments.swift")
    let publish = try body(from: "private func publishPost()", to: "// MARK:", in: src)
    XCTAssertTrue(publish.contains("location: pendingPlace"),
                  "publishPost perd la position dans sa branche sans fichier.")

    let withAttachments = try body(from: "func publishPostWithAttachments", to: "private func publishPost()", in: src)
    XCTAssertTrue(withAttachments.contains("location: pendingPlace"),
                  "publishPostWithAttachments a le meme defaut : corriger un seul chemin laisse la moitie du bug.")

    XCTAssertTrue(publish.contains("pendingPlace != nil"),
                  "Une position seule, sans texte ni piece jointe, doit pouvoir partir.")
}
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL sur les trois assertions.

- [ ] **Step 3: Implémenter**

Élargir le garde d'entrée de `publishPost()` :

```swift
        guard !text.isEmpty || !pendingAttachments.isEmpty || pendingPlace != nil else { return }
```

et passer la position dans les deux appels :

```swift
                Task { await viewModel.createPost(content: text, visibility: postVisibility,
                                                  originalLanguage: lang, location: pendingPlace) }
```

Appliquer la même modification dans `publishPostWithAttachments()` et dans le chemin hors-ligne `createOfflineMediaPost` (`:211-239`), dont le filtre par `mediaFiles[$0.id]` ne doit pas écarter la position.

Étendre la signature de `createPost` dans le view-model et dans `PostService` avec `location: SharedPlace? = nil`, sérialisé dans le corps de requête sous la clé `location`.

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift \
        apps/ios/Meeshy/Features/Main/ViewModels/ \
        packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift \
        apps/ios/MeeshyTests/Unit/Services/PermissionGateSourceGuardTests.swift
git commit -m "fix(ios/feed): les deux chemins de publication transportent la position, meme sans texte"
```

## Task 14: Rendu unique d'un lieu

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Location/LocationMessageView.swift:5-52`
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift:112-140`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/` (snapshot)

**Interfaces:**
- Consumes: `SharedPlace` (Task 6).
- Produces: `LocationMessageView(place:accentColor:onTapFullscreen:)`.

Contexte : `BubbleAttachmentView:112` **délègue déjà** à `LocationMessageView` quand les coordonnées existent ; seul son fallback sans coordonnées (`:123-140`) diverge, et il disparaît une fois la position réellement transportée. On étend la vue existante — on n'en crée pas une neuve.

- [ ] **Step 1: Écrire le test qui échoue**

```swift
func test_locationMessageView_rendersNameAndAddress() {
    let place = SharedPlace(latitude: 48.8566, longitude: 2.3522,
                            name: "Tour Eiffel", address: "Champ de Mars, Paris")
    let view = LocationMessageView(place: place)
    assertSnapshot(of: view, as: .image(layout: .fixed(width: 260, height: 210)))
}
```

Suivre le harnais de snapshot du dépôt (même API que les snapshots MeeshyUI existants) ; enregistrer les références en clair et en sombre. Vérifier que l'enregistrement a réellement produit un fichier — un script d'enregistrement silencieux a déjà masqué une absence de référence.

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — initialiseur `LocationMessageView(place:)` inexistant.

- [ ] **Step 3: Implémenter**

Ajouter l'initialiseur par `SharedPlace` en conservant l'ancien, qui reste utilisé par `LocationFullscreenView` :

```swift
    public init(place: SharedPlace,
                accentColor: String = MeeshyColors.brandPrimaryHex,
                onTapFullscreen: (() -> Void)? = nil) {
        self.init(latitude: place.latitude, longitude: place.longitude,
                  placeName: place.name, address: place.address,
                  accentColor: accentColor, onTapFullscreen: onTapFullscreen)
    }
```

Dans `BubbleAttachmentView`, router la position du message vers cette vue et retirer le fallback textuel `:123-140`, devenu inatteignable.

Déclarer dans le catalogue MeeshyUI les clés utilisées (`location.a11y.label`, `location.a11y.hint`, `location.shared`) dans **toutes** les langues d'interface : une clé absente rend le `defaultValue` français muet ailleurs.

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Location/LocationMessageView.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings \
        apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/
git commit -m "feat(sdk/ui): un seul rendu de lieu, alimente par SharedPlace"
```

---

# Phase 4 — Persistance locale

Le principe Cache-First du dépôt interdit qu'une position soit visible en ligne puis évaporée au relaunch. Le pipeline ne stocke pas l'`APIMessage` brut mais des champs dérivés — c'est ainsi que `postReplyTo` est retraduit en `replyToJson` (`MessagePersistenceActor.swift:1539+`).

## Task 15: Cache local des messages

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageDatabaseMigrations.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord+ToMessage.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/`

**Interfaces:**
- Consumes: `APIMessage.location` (Task 10).
- Produces: colonne `locationJson: String?` sur `MessageRecord`, restituée en `SharedPlace?`.

- [ ] **Step 1: Écrire le test qui échoue**

```swift
func test_messageRecord_roundTripsLocationThroughTheCache() async throws {
    let place = SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Tour Eiffel")
    let record = MessageRecord.stub(id: "m1", locationJson: try String(
        data: JSONEncoder().encode(place), encoding: .utf8))

    let message = record.toMessage()
    XCTAssertEqual(message.location?.name, "Tour Eiffel",
                   "Une position affichee en ligne puis perdue au relaunch viole le principe Cache-First.")
}
```

Adapter `MessageRecord.stub` au constructeur réellement disponible dans les tests de persistance existants.

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — `locationJson` inconnu.

- [ ] **Step 3: Implémenter**

Ajouter la colonne au record, puis une migration suivant le patron du fichier (`registerMigration("messages_call_summary")`, `:262`) :

```swift
        migrator.registerMigration("messages_location") { db in
            try db.alter(table: "messages") { t in
                t.add(column: "locationJson", .text)
            }
        }
```

Décoder depuis `APIMessage.location` à l'écriture dans `MessagePersistenceActor`, et reconstruire dans `MessageRecord+ToMessage.swift`. Ajouter `location` au modèle `Message` du SDK s'il ne le porte pas encore.

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/ packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/
git commit -m "feat(sdk/cache): un message conserve son lieu partage apres relaunch"
```

## Task 16: Cache local du feed

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/PostRecord.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/CommentRecord.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/FeedDatabaseMigrations.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/FeedPersistenceActor.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/`

**Interfaces:**
- Consumes: `APIPost.location`, `APIPostComment.location` (Task 10).
- Produces: colonne `locationJson: String?` sur `PostRecord` et `CommentRecord`.

- [ ] **Step 1: Écrire le test qui échoue**

```swift
func test_postAndCommentRecords_roundTripLocation() throws {
    let place = SharedPlace(latitude: 45.75, longitude: 4.85, name: "Lyon")
    let json = try String(data: JSONEncoder().encode(place), encoding: .utf8)

    XCTAssertEqual(PostRecord.stub(id: "p1", locationJson: json).toPost().location?.name, "Lyon")
    XCTAssertEqual(CommentRecord.stub(id: "c1", locationJson: json).toComment().location?.name, "Lyon")
}
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — `locationJson` inconnu.

- [ ] **Step 3: Implémenter**

Même schéma que la Task 15, avec une migration `feed_location` dans `FeedDatabaseMigrations.swift` ajoutant la colonne aux deux tables.

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/ packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/
git commit -m "feat(sdk/cache): un post et un commentaire conservent leur lieu partage"
```

## Task 17: Envoi hors-ligne

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxRecord.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/Mutations/MutationPayloads.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift:211-239`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/`

**Interfaces:**
- Consumes: `SharedPlace` (Task 6).
- Produces: `location` sérialisé dans la charge d'outbox.

Contexte : sans cela, la position d'un envoi effectué hors-ligne est perdue au flush.

- [ ] **Step 1: Écrire le test qui échoue**

```swift
func test_outboxPayload_survivesAFlushWithItsLocation() throws {
    let place = SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Tour Eiffel")
    let payload = CreatePostPayload(content: "ici", visibility: "PUBLIC", location: place)
    let restored = try JSONDecoder().decode(CreatePostPayload.self,
                                            from: try JSONEncoder().encode(payload))
    XCTAssertEqual(restored.location?.name, "Tour Eiffel")
}
```

Adapter le nom du type de charge à celui réellement défini dans `MutationPayloads.swift`.

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — argument `location:` inconnu.

- [ ] **Step 3: Implémenter**

Ajouter `public let location: SharedPlace?` aux charges de création de message, de post et de commentaire, et le renseigner depuis `pendingPlace` dans `createOfflineMediaPost` ainsi que dans le chemin texte durable.

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/ \
        apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift
git commit -m "feat(sdk/outbox): un envoi hors-ligne conserve sa position au flush"
```

---

# Phase 5 — Pastille de lieu en story

## Task 18: Le modèle `StoryLocationObject`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:1462-1490` (Codable de `StorySlide`)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/`

**Interfaces:**
- Consumes: `SharedPlace` (Task 6).
- Produces: `StoryLocationObject` (`id`, `place`, `x`, `y`, `scale`, `rotation`, `zIndex`, `anchor`) et `StorySlide.locationObjects: [StoryLocationObject]`.

Contexte : le Codable de `StorySlide` est custom. Une clé oubliée dans `CodingKeys` ou dans `encode` provoque une perte silencieuse au round-trip d'édition.

- [ ] **Step 1: Écrire le test qui échoue**

```swift
func test_storySlide_roundTripsLocationObjects() throws {
    let object = StoryLocationObject(
        id: "loc-1",
        place: SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Tour Eiffel"),
        x: 0.5, y: 0.8, scale: 1.0, rotation: 0, zIndex: 3,
        anchor: CGPoint(x: 0.5, y: 0.5))
    let slide = StorySlide.stub(locationObjects: [object])

    let restored = try JSONDecoder().decode(
        StorySlide.self, from: try JSONEncoder().encode(slide))
    XCTAssertEqual(restored.locationObjects.first?.place.name, "Tour Eiffel",
                   "Une clef absente de CodingKeys ou d'encode perd l'objet en silence.")
    XCTAssertEqual(restored.locationObjects.first?.zIndex, 3)
}

func test_legacySlideWithoutLocationObjectsStillDecodes() throws {
    let json = Data(#"{"id":"s1","textObjects":[]}"#.utf8)
    let slide = try JSONDecoder().decode(StorySlide.self, from: json)
    XCTAssertTrue(slide.locationObjects.isEmpty,
                  "Les stories deja sur disque doivent continuer a se decoder.")
}
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — `StoryLocationObject` inconnu.

- [ ] **Step 3: Implémenter**

```swift
/// Pastille de lieu posée sur une slide. Mêmes transforms qu'un
/// `StoryTextObject` — la pastille est hors timeline : toujours visible sur sa
/// slide, sans `startTime` ni `duration`. `TimelineClipKind` n'est donc pas
/// étendu.
public struct StoryLocationObject: Codable, Identifiable, Sendable {
    public var id: String
    public var place: SharedPlace
    public var x: Double
    public var y: Double
    public var scale: Double
    public var rotation: Double
    public var zIndex: Int
    public var anchor: CGPoint

    public init(id: String = UUID().uuidString, place: SharedPlace,
                x: Double = 0.5, y: Double = 0.8, scale: Double = 1.0,
                rotation: Double = 0, zIndex: Int = 0,
                anchor: CGPoint = CGPoint(x: 0.5, y: 0.5)) {
        self.id = id; self.place = place
        self.x = x; self.y = y; self.scale = scale
        self.rotation = rotation; self.zIndex = zIndex; self.anchor = anchor
    }
}
```

Dans `StorySlide` : la propriété `public var locationObjects: [StoryLocationObject] = []`, la clé dans `CodingKeys`, `decodeIfPresent(… ) ?? []` dans le décodeur, et l'écriture dans `encode`.

Ajouter `locationObjects` au `contentHash` du cache canvas, faute de quoi le rendu reste figé après édition.

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Models/
git commit -m "feat(sdk/story): StoryLocationObject, une pastille de lieu posable sur une slide"
```

## Task 19: Dessin de la pastille

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/`

**Interfaces:**
- Consumes: `StoryLocationObject` (Task 18).
- Produces: une branche CALayer de `StoryRenderer.render` traitant `locationObjects`.

Contexte : `StoryRenderer.render` est la source **unique** du premier plan — le canvas live (`StoryCanvasUIView+Rendering.swift:154`), le backdrop (`StoryBackdropCapture.swift:172`) et le compositor d'export (`StoryAVCompositor.swift:237-248`) lui délèguent tous. Une pastille dessinée là couvre canvas **et** export. Dessinée ailleurs, elle sortirait invisible de la vidéo.

- [ ] **Step 1: Écrire le test qui échoue**

```swift
func test_renderer_drawsLocationBadge_soItSurvivesExport() throws {
    let slide = StorySlide.stub(locationObjects: [
        StoryLocationObject(place: SharedPlace(latitude: 48.8566, longitude: 2.3522,
                                               name: "Tour Eiffel"))
    ])
    let image = StoryRenderer.render(slide: slide, size: CGSize(width: 1080, height: 1920))

    XCTAssertFalse(image.isUniformlyTransparent,
                   "Une pastille dessinee hors de StoryRenderer sort invisible de la video exportee.")
}
```

Utiliser l'assertion de non-vacuité déjà employée par les tests de rendu de story du dépôt ; si `isUniformlyTransparent` n'existe pas, échantillonner le pixel au centre de la pastille attendue.

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — la frame ne contient aucune pastille.

- [ ] **Step 3: Implémenter**

Dans `StoryRenderer.render`, à la suite du traitement de `textObjects`, itérer sur `locationObjects` triés par `zIndex` et composer pour chacun un `CATextLayer` (nom du lieu) dans un conteneur arrondi, précédé d'un glyphe d'épingle, en appliquant `x`/`y` normalisés, `scale`, `rotation` et `anchor` comme le fait déjà la branche texte.

Quand `place.name` est `nil`, replier sur `place.address` ; si les deux sont `nil`, sur la chaîne localisée `story.location.here` (`defaultValue: "Ici"`), déclarée dans le catalogue MeeshyUI avec `bundle: .module` et traduite dans toutes les langues d'interface.

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/
git commit -m "feat(sdk/story): la pastille de lieu est dessinee par StoryRenderer, donc exportee"
```

## Task 20: Poser et manipuler la pastille

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift:147`
- Modify: le chrome du composer de story (chips d'outils)
- Modify: `apps/ios/Meeshy/Localizable.xcstrings`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/`

**Interfaces:**
- Consumes: `StoryLocationObject` (Task 18), `LocationPickerView` (Task 11).
- Produces: un cas `location` dans l'énumération de sélection du canvas (`case text, media, sticker` → `case text, media, sticker, location`).

- [ ] **Step 1: Écrire le test qui échoue**

```swift
func test_canvasSelectionRecognisesALocationBadge() {
    XCTAssertNotNil(StoryCanvasSelection.location,
                    "Sans cas dedie, la pastille n'est ni selectionnable ni deplacable.")
}
```

Adapter le nom du type à l'énumération réelle de `StoryCanvasUIView.swift:147`.

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — cas `location` inexistant.

- [ ] **Step 3: Implémenter**

Ajouter le cas à l'énumération et router le hit-testing, le déplacement, la rotation et le redimensionnement vers `locationObjects` comme pour `textObjects`.

Ajouter au chrome du composer une entrée « Lieu » qui présente `LocationPickerView` et, sur sélection, insère un `StoryLocationObject` centré en bas de slide. La chaîne du libellé va dans le catalogue de l'app avec `bundle: .main`.

Ne pas ajouter la pastille à la timeline : la décision du spec est qu'elle reste hors timeline.

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Vérifier au rendu réel**

Poser une pastille dans le composer sur le simulateur `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`, la déplacer, exporter la story, et confirmer que la pastille est présente dans la vidéo exportée.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/ apps/ios/Meeshy/Localizable.xcstrings \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/
git commit -m "feat(ios/story): poser, deplacer et exporter une pastille de lieu"
```

---

# Phase 6 — Nettoyage

## Task 21: Retirer le chemin statique mort

**Files:**
- Delete/Modify: `services/gateway/src/socketio/handlers/LocationHandler.ts` (handler statique **seulement**)
- Modify: `services/gateway/src/socketio/MeeshySocketIOManager.ts:148,294-295`
- Modify: `services/gateway/src/utils/socket-rate-limiter.ts` (`LOCATION_SHARE`)
- Modify: `packages/shared/types/socketio-events.ts`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/LocationService.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift:1884,2956`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/LocationModels.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:4418`
- Modify: `apps/ios/MeeshyTests/Mocks/MockMessageSocket.swift:36,96,166`
- Modify: `services/gateway/src/socketio/handlers/__tests__/LocationHandler.test.ts`

**Interfaces:**
- Produces: aucune. Suppression pure.

Contexte : vérification faite — le web ne contient aucune occurrence de `location:share`, et Android n'écoute que `location:live-*` (`sdk-core/.../MessageSocketManager.kt:124-126`). **Tout le `live-*` est préservé** : Android en dépend, et c'est hors périmètre. Le fichier de tests est mixte : n'en retirer que les blocs statiques.

- [ ] **Step 1: Confirmer l'absence d'émetteur avant de supprimer**

```bash
rg -n "location:share" apps/web/src apps/android packages/ services/ || echo "aucun emetteur restant"
```

Expected: aucune occurrence hors des fichiers listés ci-dessus. Si une occurrence apparaît ailleurs, **arrêter** et signaler : la suppression n'est plus sûre.

- [ ] **Step 2: Supprimer**

Retirer `handleLocationShare`, son enregistrement, la limite de débit `LOCATION_SHARE`, les types `LocationShareData` et `LocationSharedEventData`, `LocationService.shareLocation`, `emitLocationShare`, le listener `location:shared`, `LocationSharePayload`, `LocationSharedEvent`, `ConversationViewModel.shareLocation` et les stubs de mock correspondants. Retirer du fichier de tests les seuls blocs `describe`/`it` visant le partage statique.

- [ ] **Step 3: Vérifier que rien de vivant n'a été emporté**

Run: `cd services/gateway && bun test && bunx tsc --noEmit`
Run: `./apps/ios/meeshy.sh test`
Expected: PASS des deux côtés, et les tests `live-*` toujours présents et verts.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "chore: retire le partage de position statique par socket, jamais appele, en preservant le live"
```

---

## Recette finale

- [ ] Autoriser la localisation à froid sur un appareil réel : l'app ne plante pas, la carte se centre.
- [ ] Envoyer une position en message, en commentaire, en post depuis les **deux** composers : chacune s'affiche avec sa carte et son nom de lieu.
- [ ] Publier un post ne contenant **qu'une** position, sans texte : il part.
- [ ] Tuer l'app, la relancer : les quatre positions sont toujours là.
- [ ] Envoyer une position en mode avion, revenir en ligne : elle part au flush avec son lieu.
- [ ] Poser une pastille dans une story, exporter : la pastille est dans la vidéo.
- [ ] Basculer l'interface en arabe : aucune chaîne de position ne reste en français.
