# Sélecteur de lieu iOS — précision de partage et type de carte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner au `LocationPickerView` les couleurs primaire **et** accent de la conversation, libérer le bouton de recentrage que la barre de recherche masquait, et ajouter un réglage persistant et applicatif de précision de position et de type de carte.

**Architecture:** Un enum pur `LocationPrecision` dans `MeeshySDK/Models` porte le moteur d'arrondi (`coarsen`), un store `LocationSharingPreferencesStore` dans `MeeshyUI` le persiste en UserDefaults, et `AdaptiveInteractiveMap` gagne deux paramètres opaques (`style`, `defaultControls`). Côté app, `LocationPickerView` compose ces blocs et `LocationSharingSettingsSection` — une vue unique — est rendue à la fois dans la feuille `(i)` du picker et dans Réglages > Confidentialité.

**Tech Stack:** Swift 6.2, SwiftUI, MapKit, CoreLocation, Combine, XCTest.

Spec de référence : `docs/superpowers/specs/2026-08-09-location-picker-precision-and-map-style-design.md`

## Global Constraints

- **Plancher iOS 16.0.** `.mapStyle` est iOS 17+ : toute UI de style de carte est masquée derrière `Platform.isIOS17OrLater`.
- **SDK purity.** Types purs et rule engines → `packages/MeeshySDK/`. Orchestration UX, ViewModels, décisions produit → `apps/ios/`.
- **Aucune chaîne localisée dans le SDK** pour ce lot. Les libellés vivent côté app.
- **Cliquet français à zéro tolérance.** Toute clé neuve sous `apps/ios/Meeshy/` entre dans `apps/ios/Meeshy/Localizable.xcstrings` dans les **7 langues** : `fr` (source), `en`, `es`, `de`, `it`, `pt-BR`, `ar`. Sinon `FrenchDefaultValueRatchetTests` échoue.
- **Défauts non régressifs :** `precision: .exact`, `mapStyle: .standard` — le comportement actuel.
- **Pas de `Date.now`/aléatoire** dans les tests ; fixtures déterministes.
- **Commits sélectifs** (`git add` de chemins explicites, jamais `-A`) — le worktree est partagé. Pas de trailer co-author.
- **Tests SDK** : XCTest, noms français `test_{méthode}_{condition}` (convention du dossier).
- **`meeshy.sh` ne lance pas xcodegen** : les nouveaux fichiers sous `Meeshy/` sont auto-inclus par le globbing de `project.yml`, mais le pbxproj committé peut être périmé — lancer `cd apps/ios && xcodegen generate` avant le build final, puis `git checkout --` sur le churn (pbxproj, xcscheme, Package.resolved).

---

## File Structure

**Créés**

| Fichier | Responsabilité |
|---|---|
| `packages/MeeshySDK/Sources/MeeshySDK/Models/LocationSharingPreferences.swift` | `LocationPrecision`, `SharedMapStyle`, `PlaceCoarseNames`, `LocationSharingPreferences`, moteur `coarsen` |
| `packages/MeeshySDK/Sources/MeeshyUI/Location/LocationSharingPreferencesStore.swift` | Persistance UserDefaults + publication Combine |
| `apps/ios/Meeshy/Features/Main/Components/LocationSharingSettingsSection.swift` | Vue de réglages partagée (2 sections radio) + la feuille qui l'enveloppe |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Models/LocationPrecisionTests.swift` | Tests du moteur d'arrondi |
| `packages/MeeshySDK/Tests/MeeshyUITests/Location/LocationSharingPreferencesStoreTests.swift` | Tests de persistance |
| `apps/ios/MeeshyTests/Unit/Views/LocationPickerModelTests.swift` | Tests de `sharedPlace(at:)` |
| `apps/ios/MeeshyTests/Unit/Views/LocationPickerSourceGuardTests.swift` | 2 gardes de source |

**Modifiés**

| Fichier | Changement |
|---|---|
| `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveMap.swift` | `style:` + `defaultControls:` sur `AdaptiveInteractiveMap` |
| `apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift` | Couleurs, layout, colonne de contrôles, feuille, coarsening, composants du placemark |
| `apps/ios/Meeshy/Features/Main/Views/PrivacySettingsView.swift` | Section « Position » |
| `apps/ios/Meeshy/Localizable.xcstrings` | Clés neuves × 7 langues |

**Ordre :** Task 1 (modèle SDK) → Task 2 (store SDK) → Task 3 (carte SDK) → Task 4 (picker app) → Task 5 (vue de réglages + feuille) → Task 6 (Réglages > Confidentialité) → Task 7 (catalogue + build final).

---

## Task 1 : Modèle et moteur de précision (SDK)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/LocationSharingPreferences.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/LocationPrecisionTests.swift`

**Interfaces:**
- Consumes: `SharedPlace` (déjà présent dans `MeeshySDK/Models/SharedPlace.swift`, propriétés `latitude`, `longitude`, `name`, `address`, `category`, toutes `let`).
- Produces:
  - `public enum LocationPrecision: String, Codable, CaseIterable, Sendable { case exact, around, neighborhood, city }`
  - `public var decimalPlaces: Int?` (nil / 3 / 2 / 1)
  - `public var approximateRadiusMeters: Double?` (nil / 100 / 1000 / 10000)
  - `public func coarsen(_ place: SharedPlace, names: PlaceCoarseNames) -> SharedPlace`
  - `public struct PlaceCoarseNames: Equatable, Sendable` avec `subLocality`, `locality`, `administrativeArea`, `country` (tous `String?`) et `public static let empty`
  - `public enum SharedMapStyle: String, Codable, CaseIterable, Sendable { case standard, hybrid, imagery }`
  - `public struct LocationSharingPreferences: Codable, Equatable, Sendable { public var precision: LocationPrecision; public var mapStyle: SharedMapStyle; public static let defaults }`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `packages/MeeshySDK/Tests/MeeshySDKTests/Models/LocationPrecisionTests.swift` :

```swift
import XCTest
@testable import MeeshySDK

/// Moteur de dégradation de précision : ce qui part réellement quand
/// l'utilisateur choisit autre chose que « Exacte ». La règle ne se contente
/// pas d'arrondir les coordonnées — envoyer « 12 rue de la Paix » avec une
/// position à ±10 km annulerait l'arrondi. Le nom et l'adresse sont donc
/// REMPLACÉS par le composant géographique de granularité correspondante.
final class LocationPrecisionTests: XCTestCase {

    private func makePlace(
        latitude: Double = 48.85837,
        longitude: Double = 2.29448
    ) -> SharedPlace {
        SharedPlace(
            latitude: latitude,
            longitude: longitude,
            name: "Tour Eiffel",
            address: "Champ de Mars, 75007 Paris",
            category: "landmark"
        )
    }

    private func makeNames(
        subLocality: String? = "Gros-Caillou",
        locality: String? = "Paris",
        administrativeArea: String? = "Île-de-France",
        country: String? = "France"
    ) -> PlaceCoarseNames {
        PlaceCoarseNames(
            subLocality: subLocality,
            locality: locality,
            administrativeArea: administrativeArea,
            country: country
        )
    }

    // MARK: - Exacte

    func test_coarsen_exact_rendLeLieuIntact() {
        let place = makePlace()
        let result = LocationPrecision.exact.coarsen(place, names: makeNames())

        XCTAssertEqual(result.latitude, 48.85837, accuracy: 1e-9)
        XCTAssertEqual(result.longitude, 2.29448, accuracy: 1e-9)
        XCTAssertEqual(result.name, "Tour Eiffel")
        XCTAssertEqual(result.address, "Champ de Mars, 75007 Paris")
        XCTAssertEqual(result.category, "landmark")
    }

    // MARK: - Autour (~100 m)

    func test_coarsen_around_arrondiATroisDecimalesEtConserveLIdentite() {
        let result = LocationPrecision.around.coarsen(makePlace(), names: makeNames())

        XCTAssertEqual(result.latitude, 48.858, accuracy: 1e-9)
        XCTAssertEqual(result.longitude, 2.294, accuracy: 1e-9)
        XCTAssertEqual(result.name, "Tour Eiffel")
        XCTAssertEqual(result.address, "Champ de Mars, 75007 Paris")
        XCTAssertEqual(result.category, "landmark")
    }

    // MARK: - Quartier (~1 km)

    func test_coarsen_neighborhood_prendLeSubLocalityEtVideLaCategorie() {
        let result = LocationPrecision.neighborhood.coarsen(makePlace(), names: makeNames())

        XCTAssertEqual(result.latitude, 48.86, accuracy: 1e-9)
        XCTAssertEqual(result.longitude, 2.29, accuracy: 1e-9)
        XCTAssertEqual(result.name, "Gros-Caillou")
        XCTAssertEqual(result.address, "Paris, France")
        XCTAssertNil(result.category)
    }

    func test_coarsen_neighborhood_sansSubLocality_retombeSurLaVille() {
        let names = makeNames(subLocality: nil)
        let result = LocationPrecision.neighborhood.coarsen(makePlace(), names: names)

        XCTAssertEqual(result.name, "Paris")
        // « Paris » est déjà le nom : l'adresse ne le répète pas.
        XCTAssertEqual(result.address, "France")
    }

    // MARK: - Ville (~10 km)

    func test_coarsen_city_prendLaVilleEtVideLaCategorie() {
        let result = LocationPrecision.city.coarsen(makePlace(), names: makeNames())

        XCTAssertEqual(result.latitude, 48.9, accuracy: 1e-9)
        XCTAssertEqual(result.longitude, 2.3, accuracy: 1e-9)
        XCTAssertEqual(result.name, "Paris")
        XCTAssertEqual(result.address, "Île-de-France, France")
        XCTAssertNil(result.category)
    }

    func test_coarsen_city_sansLocality_retombeSurLaRegion() {
        let names = makeNames(locality: nil)
        let result = LocationPrecision.city.coarsen(makePlace(), names: names)

        XCTAssertEqual(result.name, "Île-de-France")
        XCTAssertEqual(result.address, "France")
    }

    // MARK: - Aucun composant disponible (plein désert : le cas Tessalit)

    func test_coarsen_neighborhood_sansAucunComposant_neGardeQueLesCoordonnees() {
        let place = SharedPlace(latitude: 20.00004, longitude: -0.00006)
        let result = LocationPrecision.neighborhood.coarsen(place, names: .empty)

        XCTAssertEqual(result.latitude, 20.0, accuracy: 1e-9)
        XCTAssertEqual(result.longitude, -0.0, accuracy: 1e-9)
        XCTAssertNil(result.name)
        XCTAssertNil(result.address)
        XCTAssertNil(result.category)
    }

    // MARK: - Arrondi symétrique

    func test_coarsen_arrondiSymetriqueSurLesValeursNegatives() {
        let place = SharedPlace(latitude: -33.86785, longitude: -151.20732)
        let result = LocationPrecision.around.coarsen(place, names: .empty)

        XCTAssertEqual(result.latitude, -33.868, accuracy: 1e-9)
        XCTAssertEqual(result.longitude, -151.207, accuracy: 1e-9)
    }

    // MARK: - Métadonnées

    func test_decimalPlaces_parNiveau() {
        XCTAssertNil(LocationPrecision.exact.decimalPlaces)
        XCTAssertEqual(LocationPrecision.around.decimalPlaces, 3)
        XCTAssertEqual(LocationPrecision.neighborhood.decimalPlaces, 2)
        XCTAssertEqual(LocationPrecision.city.decimalPlaces, 1)
    }

    func test_approximateRadiusMeters_parNiveau() {
        XCTAssertNil(LocationPrecision.exact.approximateRadiusMeters)
        XCTAssertEqual(LocationPrecision.around.approximateRadiusMeters, 100)
        XCTAssertEqual(LocationPrecision.neighborhood.approximateRadiusMeters, 1000)
        XCTAssertEqual(LocationPrecision.city.approximateRadiusMeters, 10000)
    }

    // MARK: - Préférences

    func test_preferences_roundtripCodable() throws {
        let prefs = LocationSharingPreferences(precision: .neighborhood, mapStyle: .hybrid)
        let data = try JSONEncoder().encode(prefs)
        let decoded = try JSONDecoder().decode(LocationSharingPreferences.self, from: data)

        XCTAssertEqual(decoded, prefs)
    }

    func test_preferences_defautsNonRegressifs() {
        XCTAssertEqual(LocationSharingPreferences.defaults.precision, .exact)
        XCTAssertEqual(LocationSharingPreferences.defaults.mapStyle, .standard)
    }
}
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd /Users/smpceo/Documents/v2_meeshy && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshySDKTests/LocationPrecisionTests -quiet 2>&1 | tail -20
```

Attendu : **échec de compilation** — `cannot find 'LocationPrecision' in scope`.

- [ ] **Step 3 : Écrire l'implémentation minimale**

Créer `packages/MeeshySDK/Sources/MeeshySDK/Models/LocationSharingPreferences.swift` :

```swift
import Foundation

// MARK: - Précision de partage

/// À quel grain la position de l'utilisateur est transmise.
///
/// L'enum ne porte AUCUN libellé : c'est de la donnée. Les libellés
/// (« Quartier », « ~1 km ») vivent côté app, dans
/// `LocationSharingSettingsSection`. Mettre des chaînes ici obligerait à
/// alimenter le catalogue `.module` du SDK et reproduirait le défaut de
/// `LiveLocationDuration.displayText`, qui rend du français en dur quelle que
/// soit la langue de l'interface.
public enum LocationPrecision: String, Codable, CaseIterable, Sendable {
    /// Aucun arrondi — au mieux de ce que rend le GPS.
    case exact
    /// ~100 m.
    case around
    /// ~1 km.
    case neighborhood
    /// ~10 km.
    case city

    /// Décimales conservées sur latitude et longitude. `nil` = pas d'arrondi.
    ///
    /// 1 décimale de latitude ≈ 11 km, 2 ≈ 1,1 km, 3 ≈ 111 m — d'où la
    /// correspondance avec les rayons annoncés.
    public var decimalPlaces: Int? {
        switch self {
        case .exact:        return nil
        case .around:       return 3
        case .neighborhood: return 2
        case .city:         return 1
        }
    }

    /// Rayon d'imprécision annoncé à l'utilisateur, en mètres.
    public var approximateRadiusMeters: Double? {
        switch self {
        case .exact:        return nil
        case .around:       return 100
        case .neighborhood: return 1_000
        case .city:         return 10_000
        }
    }

    /// Applique la dégradation au lieu choisi.
    ///
    /// Arrondir les coordonnées ne suffit pas : envoyer
    /// « 12 rue de la Paix, Paris » avec une position à ±10 km annulerait
    /// l'arrondi. Aux deux paliers grossiers, le nom et l'adresse sont donc
    /// REMPLACÉS par le composant géographique de granularité correspondante,
    /// et la catégorie POI est vidée — « restaurant » à ±10 km reste une fuite
    /// sur ce que fait la personne.
    ///
    /// Quand aucun composant n'est disponible (plein océan, désert), le
    /// résultat ne porte que les coordonnées arrondies. C'est une dégradation
    /// propre, pas une erreur.
    public func coarsen(_ place: SharedPlace, names: PlaceCoarseNames) -> SharedPlace {
        guard let places = decimalPlaces else { return place }

        let latitude = Self.round(place.latitude, to: places)
        let longitude = Self.round(place.longitude, to: places)

        switch self {
        case .exact:
            return place
        case .around:
            return SharedPlace(
                latitude: latitude, longitude: longitude,
                name: place.name, address: place.address, category: place.category
            )
        case .neighborhood:
            let name = names.subLocality ?? names.locality
            return SharedPlace(
                latitude: latitude, longitude: longitude,
                name: name,
                address: Self.join([names.locality, names.country], excluding: name),
                category: nil
            )
        case .city:
            let name = names.locality ?? names.administrativeArea
            return SharedPlace(
                latitude: latitude, longitude: longitude,
                name: name,
                address: Self.join([names.administrativeArea, names.country], excluding: name),
                category: nil
            )
        }
    }

    /// Arrondi au demi supérieur en valeur absolue, donc symétrique autour de
    /// zéro : `-33.8678` et `33.8678` s'arrondissent au même écart.
    /// `Double.rounded()` le fait déjà (`.toNearestOrAwayFromZero`).
    private static func round(_ value: Double, to places: Int) -> Double {
        let factor = pow(10.0, Double(places))
        return (value * factor).rounded() / factor
    }

    /// Joint les composants non vides, en écartant celui déjà utilisé comme
    /// nom — sinon « Paris » apparaîtrait deux fois quand `subLocality` manque.
    private static func join(_ parts: [String?], excluding name: String?) -> String? {
        let kept = parts.compactMap { $0 }.filter { $0 != name }
        return kept.isEmpty ? nil : kept.joined(separator: ", ")
    }
}

// MARK: - Composants géographiques

/// Les composants d'un `CLPlacemark` conservés SÉPARÉMENT, pour que la
/// dégradation puisse choisir le bon grain. Le picker les aplatit aujourd'hui
/// en une seule chaîne d'adresse, ce qui rend impossible de n'en garder que le
/// quartier ou la ville.
public struct PlaceCoarseNames: Equatable, Sendable {
    public let subLocality: String?
    public let locality: String?
    public let administrativeArea: String?
    public let country: String?

    public init(
        subLocality: String? = nil,
        locality: String? = nil,
        administrativeArea: String? = nil,
        country: String? = nil
    ) {
        self.subLocality = subLocality
        self.locality = locality
        self.administrativeArea = administrativeArea
        self.country = country
    }

    public static let empty = PlaceCoarseNames()
}

// MARK: - Style de carte

/// Rendu de la carte. `imagery` = satellite sans étiquettes, `hybrid` =
/// satellite avec étiquettes — la distinction d'`MKMapConfiguration`.
public enum SharedMapStyle: String, Codable, CaseIterable, Sendable {
    case standard
    case hybrid
    case imagery
}

// MARK: - Préférences

/// Préférences APPLICATIVES de partage de position — pas par conversation.
/// Persistées par `LocationSharingPreferencesStore` (MeeshyUI).
public struct LocationSharingPreferences: Codable, Equatable, Sendable {
    public var precision: LocationPrecision
    public var mapStyle: SharedMapStyle

    public init(precision: LocationPrecision = .exact, mapStyle: SharedMapStyle = .standard) {
        self.precision = precision
        self.mapStyle = mapStyle
    }

    /// `exact` / `standard` : le comportement actuel. Changer silencieusement
    /// la précision de partage d'un utilisateur existant serait une régression
    /// fonctionnelle déguisée en réglage.
    public static let defaults = LocationSharingPreferences()
}
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```bash
cd /Users/smpceo/Documents/v2_meeshy && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshySDKTests/LocationPrecisionTests -quiet 2>&1 | tail -20
```

Attendu : **TEST SUCCEEDED**, 11 tests verts.

> Si `test_coarsen_city_prendLaVilleEtVideLaCategorie` échoue sur la longitude
> (`2.3` attendu, `2.29` obtenu), c'est que `decimalPlaces` de `.city` vaut 2 et
> non 1 — corriger l'enum, pas le test.

- [ ] **Step 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add \
  packages/MeeshySDK/Sources/MeeshySDK/Models/LocationSharingPreferences.swift \
  packages/MeeshySDK/Tests/MeeshySDKTests/Models/LocationPrecisionTests.swift && \
git commit -m "feat(sdk/location): precision de partage et degradation par palier"
```

---

## Task 2 : Store de préférences (SDK)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Location/LocationSharingPreferencesStore.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Location/LocationSharingPreferencesStoreTests.swift`

**Interfaces:**
- Consumes: `LocationSharingPreferences`, `LocationPrecision`, `SharedMapStyle` (Task 1).
- Produces:
  - `@MainActor public final class LocationSharingPreferencesStore: ObservableObject`
  - `@MainActor public static let shared`
  - `@Published public var preferences: LocationSharingPreferences`
  - `public static let storageKey = "me.meeshy.locationSharingPreferences"`
  - `public static func load(userDefaults: UserDefaults = .standard) -> LocationSharingPreferences`
  - `public static func save(_ prefs: LocationSharingPreferences, userDefaults: UserDefaults = .standard)`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `packages/MeeshySDK/Tests/MeeshyUITests/Location/LocationSharingPreferencesStoreTests.swift` :

```swift
import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// Persistance des préférences de partage de position. Les statiques
/// `load`/`save` prennent un `UserDefaults` injectable : tester le singleton
/// écrirait dans les defaults réels du simulateur et polluerait les autres
/// suites (le bundle de tests est hébergé dans l'app).
@MainActor
final class LocationSharingPreferencesStoreTests: XCTestCase {

    /// Suite dédiée, nettoyée à chaque appel — pas d'état partagé entre tests.
    private func makeDefaults(_ name: String = #function) -> UserDefaults {
        let suite = "LocationSharingPreferencesStoreTests.\(name)"
        UserDefaults().removePersistentDomain(forName: suite)
        return UserDefaults(suiteName: suite)!
    }

    func test_load_defaultsVides_rendLesDefauts() {
        let defaults = makeDefaults()

        let loaded = LocationSharingPreferencesStore.load(userDefaults: defaults)

        XCTAssertEqual(loaded, LocationSharingPreferences.defaults)
        XCTAssertEqual(loaded.precision, .exact)
        XCTAssertEqual(loaded.mapStyle, .standard)
    }

    func test_saveEtLoad_restituentLaValeur() {
        let defaults = makeDefaults()
        let prefs = LocationSharingPreferences(precision: .city, mapStyle: .imagery)

        LocationSharingPreferencesStore.save(prefs, userDefaults: defaults)
        let loaded = LocationSharingPreferencesStore.load(userDefaults: defaults)

        XCTAssertEqual(loaded, prefs)
    }

    func test_load_jsonCorrompu_retombeSurLesDefautsSansCrash() {
        let defaults = makeDefaults()
        defaults.set(Data("pas du json".utf8),
                     forKey: LocationSharingPreferencesStore.storageKey)

        let loaded = LocationSharingPreferencesStore.load(userDefaults: defaults)

        XCTAssertEqual(loaded, LocationSharingPreferences.defaults)
    }

    func test_load_niveauDePrecisionInconnu_retombeSurLesDefauts() {
        let defaults = makeDefaults()
        defaults.set(Data(#"{"precision":"galaxie","mapStyle":"standard"}"#.utf8),
                     forKey: LocationSharingPreferencesStore.storageKey)

        let loaded = LocationSharingPreferencesStore.load(userDefaults: defaults)

        XCTAssertEqual(loaded, LocationSharingPreferences.defaults)
    }
}
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd /Users/smpceo/Documents/v2_meeshy && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyUITests/LocationSharingPreferencesStoreTests -quiet 2>&1 | tail -20
```

Attendu : **échec de compilation** — `cannot find 'LocationSharingPreferencesStore' in scope`.

- [ ] **Step 3 : Écrire l'implémentation minimale**

Créer `packages/MeeshySDK/Sources/MeeshyUI/Location/LocationSharingPreferencesStore.swift` :

```swift
import Foundation
import Combine
import MeeshySDK

/// Singleton `@MainActor` qui persiste les préférences de partage de position
/// en UserDefaults et publie les changements via Combine.
///
/// Miroir exact de `MediaDownloadPreferencesStore` : même debounce, même forme
/// de statiques injectables. Pas de clé legacy — la fonctionnalité est neuve.
@MainActor
public final class LocationSharingPreferencesStore: ObservableObject {
    @MainActor public static let shared = LocationSharingPreferencesStore()

    @Published public var preferences: LocationSharingPreferences

    public static let storageKey = "me.meeshy.locationSharingPreferences"

    private var cancellables = Set<AnyCancellable>()

    private init() {
        self.preferences = Self.load()
        $preferences
            .dropFirst()
            .debounce(for: .milliseconds(100), scheduler: DispatchQueue.main)
            .sink { Self.save($0) }
            .store(in: &cancellables)
    }

    /// Toute lecture qui échoue — clé absente, données illisibles, valeur
    /// d'enum inconnue laissée par une version future — rend les défauts.
    /// `.exact` est le repli sûr : il ne dégrade rien à l'insu de personne.
    public static func load(userDefaults: UserDefaults = .standard) -> LocationSharingPreferences {
        guard let data = userDefaults.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode(LocationSharingPreferences.self, from: data)
        else { return .defaults }
        return decoded
    }

    public static func save(
        _ prefs: LocationSharingPreferences,
        userDefaults: UserDefaults = .standard
    ) {
        guard let data = try? JSONEncoder().encode(prefs) else { return }
        userDefaults.set(data, forKey: storageKey)
    }
}
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```bash
cd /Users/smpceo/Documents/v2_meeshy && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyUITests/LocationSharingPreferencesStoreTests -quiet 2>&1 | tail -20
```

Attendu : **TEST SUCCEEDED**, 4 tests verts.

- [ ] **Step 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add \
  packages/MeeshySDK/Sources/MeeshyUI/Location/LocationSharingPreferencesStore.swift \
  packages/MeeshySDK/Tests/MeeshyUITests/Location/LocationSharingPreferencesStoreTests.swift && \
git commit -m "feat(sdk/location): store persistant des preferences de partage de position"
```

---

## Task 3 : Style de carte et contrôles optionnels (SDK)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveMap.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Compatibility/AdaptivePagingMapTests.swift` (fichier existant — y ajouter une classe)

**Interfaces:**
- Consumes: `SharedMapStyle` (Task 1).
- Produces: `AdaptiveInteractiveMap.init(target:annotationCoordinate:style:defaultControls:onRegionChange:pin:)` où `style: SharedMapStyle = .standard` et `defaultControls: Bool = true`. Les appelants existants ne sont pas touchés (valeurs par défaut).

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à la fin de `packages/MeeshySDK/Tests/MeeshyUITests/Compatibility/AdaptivePagingMapTests.swift` :

```swift
/// `AdaptiveInteractiveMap` doit pouvoir se construire SANS les contrôles
/// système et dans un style donné. Le picker de lieu en dépend : le
/// `MapUserLocationButton` de `mapControls` se rend en haut-trailing, sous la
/// barre de recherche flottante, où il est inatteignable.
final class AdaptiveInteractiveMapStyleTests: XCTestCase {

    func test_init_acceptePasDeControlesEtUnStyle() {
        let map = AdaptiveInteractiveMap(
            target: nil,
            annotationCoordinate: nil,
            style: .hybrid,
            defaultControls: false,
            onRegionChange: { _ in }
        ) { EmptyView() }

        XCTAssertNotNil(map.body)
    }

    func test_init_conserveSesDefautsPourLesAppelantsExistants() {
        // Signature historique, sans `style:` ni `defaultControls:` — les six
        // autres appelants du SDK et de l'app doivent continuer à compiler.
        let map = AdaptiveInteractiveMap(
            target: nil,
            annotationCoordinate: nil,
            onRegionChange: { _ in }
        ) { EmptyView() }

        XCTAssertNotNil(map.body)
    }
}
```

Vérifier que le fichier importe bien `SwiftUI`, `MapKit`, `XCTest`, `@testable import MeeshyUI` et `@testable import MeeshySDK` ; ajouter les imports manquants en tête de fichier.

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd /Users/smpceo/Documents/v2_meeshy && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyUITests/AdaptiveInteractiveMapStyleTests -quiet 2>&1 | tail -20
```

Attendu : **échec de compilation** — `extra arguments 'style', 'defaultControls' in call`.

- [ ] **Step 3 : Écrire l'implémentation minimale**

Dans `AdaptiveMap.swift`, remplacer entièrement `public struct AdaptiveInteractiveMap` et les deux sous-vues :

```swift
public struct AdaptiveInteractiveMap<PinContent: View>: View {
    private let target: MapTarget?
    private let annotationCoordinate: CLLocationCoordinate2D?
    private let style: SharedMapStyle
    private let defaultControls: Bool
    private let onRegionChange: (CLLocationCoordinate2D) -> Void
    private let pin: () -> PinContent

    /// - Parameters:
    ///   - target: où recentrer la carte ; `nil` ouvre sur une région neutre
    ///     fixe (`AdaptiveMapInitialRegion.neutral`) sur toutes les versions.
    ///   - annotationCoordinate: coordonnée de l'unique pin, ou `nil`.
    ///   - style: rendu de la carte. Sans effet sur iOS 16 (`.mapStyle` est
    ///     iOS 17+) : les appelants qui exposent un sélecteur de style doivent
    ///     le masquer derrière `Platform.isIOS17OrLater`.
    ///   - defaultControls: rend `MapUserLocationButton` + `MapCompass`. À
    ///     mettre à `false` quand l'appelant pose ses propres contrôles —
    ///     ceux du système se placent en haut-trailing et passent sous toute
    ///     barre flottante qui y vit.
    ///   - onRegionChange: appelé avec le centre après déplacement de caméra.
    ///   - pin: construit la vue du pin.
    public init(
        target: MapTarget?,
        annotationCoordinate: CLLocationCoordinate2D?,
        style: SharedMapStyle = .standard,
        defaultControls: Bool = true,
        onRegionChange: @escaping (CLLocationCoordinate2D) -> Void,
        @ViewBuilder pin: @escaping () -> PinContent
    ) {
        self.target = target
        self.annotationCoordinate = annotationCoordinate
        self.style = style
        self.defaultControls = defaultControls
        self.onRegionChange = onRegionChange
        self.pin = pin
    }

    public var body: some View {
        if #available(iOS 17.0, *) {
            ModernInteractiveMap(
                target: target,
                annotationCoordinate: annotationCoordinate,
                style: style,
                defaultControls: defaultControls,
                onRegionChange: onRegionChange,
                pin: pin
            )
        } else {
            LegacyInteractiveMap(
                target: target,
                annotationCoordinate: annotationCoordinate,
                onRegionChange: onRegionChange,
                pin: pin
            )
        }
    }
}
```

Puis `ModernInteractiveMap` — ajouter les deux stockages, le `.mapStyle` et le `mapControls` conditionnel :

```swift
@available(iOS 17.0, *)
private struct ModernInteractiveMap<PinContent: View>: View {
    private let target: MapTarget?
    private let annotationCoordinate: CLLocationCoordinate2D?
    private let style: SharedMapStyle
    private let defaultControls: Bool
    private let onRegionChange: (CLLocationCoordinate2D) -> Void
    private let pin: () -> PinContent

    @State private var position: MapCameraPosition

    init(
        target: MapTarget?,
        annotationCoordinate: CLLocationCoordinate2D?,
        style: SharedMapStyle,
        defaultControls: Bool,
        onRegionChange: @escaping (CLLocationCoordinate2D) -> Void,
        @ViewBuilder pin: @escaping () -> PinContent
    ) {
        self.target = target
        self.annotationCoordinate = annotationCoordinate
        self.style = style
        self.defaultControls = defaultControls
        self.onRegionChange = onRegionChange
        self.pin = pin
        self._position = State(initialValue: .region(AdaptiveMapInitialRegion.resolve(for: target)))
    }

    var body: some View {
        Map(position: $position, interactionModes: .all) {
            if let annotationCoordinate {
                Annotation("", coordinate: annotationCoordinate) { pin() }
            }
        }
        // `.mapStyle` est un modificateur de RENDU : il ne touche ni
        // `position` ni `region`, donc il n'ouvre pas le chemin de ré-entrance
        // synchrone documenté par `AdaptiveMapInitialRegion`.
        .mapStyle(resolvedStyle)
        .onMapCameraChange(frequency: .onEnd) { context in
            onRegionChange(context.camera.centerCoordinate)
        }
        .mapControls {
            if defaultControls {
                MapUserLocationButton()
                MapCompass()
            }
        }
        .onChange(of: target) { _, newTarget in
            if let newTarget { position = .region(newTarget.region) }
        }
    }

    private var resolvedStyle: MapStyle {
        switch style {
        case .standard: return .standard
        case .hybrid:   return .hybrid
        case .imagery:  return .imagery
        }
    }
}
```

`LegacyInteractiveMap` est inchangé : `.mapStyle` n'existe pas sur iOS 16, et `Map(coordinateRegion:)` n'a pas de `mapControls` — il n'y a donc rien à éteindre.

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

```bash
cd /Users/smpceo/Documents/v2_meeshy && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyUITests/AdaptiveInteractiveMapStyleTests \
  -only-testing:MeeshyUITests/AdaptivePagingMapTests -quiet 2>&1 | tail -20
```

Attendu : **TEST SUCCEEDED** — les 2 tests neufs et la suite existante.

- [ ] **Step 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add \
  packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveMap.swift \
  packages/MeeshySDK/Tests/MeeshyUITests/Compatibility/AdaptivePagingMapTests.swift && \
git commit -m "feat(sdk/map): style de carte et controles systeme optionnels sur AdaptiveInteractiveMap"
```

---

## Task 4 : Picker — composants du placemark et coarsening

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/LocationPickerModelTests.swift` (créer)

**Interfaces:**
- Consumes: `LocationPrecision`, `PlaceCoarseNames` (Task 1).
- Produces:
  - `LocationPickerModel.selectedCoarseNames: PlaceCoarseNames` (var, défaut `.empty`)
  - `LocationPickerModel.sharedPlace(at precision: LocationPrecision) -> SharedPlace?`

Cette tâche ne touche **pas** l'UI : elle installe la logique testable d'abord.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Views/LocationPickerModelTests.swift` :

```swift
import XCTest
import CoreLocation
import MeeshySDK
@testable import Meeshy

/// Ce qui part réellement quand on confirme un lieu. Le picker n'envoie plus
/// `selectedPlace` brut : il passe par `sharedPlace(at:)`, seul point où la
/// préférence de précision est appliquée.
@MainActor
final class LocationPickerModelTests: XCTestCase {

    private func makeSUT() -> LocationPickerModel {
        LocationPickerModel()
    }

    func test_sharedPlace_sansCoordonnee_rendNil() {
        let sut = makeSUT()

        XCTAssertNil(sut.sharedPlace(at: .exact))
        XCTAssertNil(sut.sharedPlace(at: .city))
    }

    func test_sharedPlace_exact_rendLeLieuBrut() {
        let sut = makeSUT()
        sut.selectedCoordinate = CLLocationCoordinate2D(latitude: 48.85837, longitude: 2.29448)
        sut.selectedName = "Tour Eiffel"
        sut.addressString = "Champ de Mars, 75007 Paris"
        sut.selectedCategory = "landmark"

        let place = sut.sharedPlace(at: .exact)

        XCTAssertEqual(place?.latitude, 48.85837)
        XCTAssertEqual(place?.name, "Tour Eiffel")
        XCTAssertEqual(place?.category, "landmark")
    }

    func test_sharedPlace_neighborhood_arrondiEtRemplaceParLeQuartier() {
        let sut = makeSUT()
        sut.selectedCoordinate = CLLocationCoordinate2D(latitude: 48.85837, longitude: 2.29448)
        sut.selectedName = "Tour Eiffel"
        sut.addressString = "Champ de Mars, 75007 Paris"
        sut.selectedCategory = "landmark"
        sut.selectedCoarseNames = PlaceCoarseNames(
            subLocality: "Gros-Caillou", locality: "Paris",
            administrativeArea: "Île-de-France", country: "France"
        )

        let place = sut.sharedPlace(at: .neighborhood)

        XCTAssertEqual(place?.latitude ?? 0, 48.86, accuracy: 1e-9)
        XCTAssertEqual(place?.longitude ?? 0, 2.29, accuracy: 1e-9)
        XCTAssertEqual(place?.name, "Gros-Caillou")
        XCTAssertNil(place?.category)
    }

    func test_sharedPlace_sansComposantsGeocodes_neGardeQueLesCoordonnees() {
        let sut = makeSUT()
        sut.selectedCoordinate = CLLocationCoordinate2D(latitude: 20.00004, longitude: -0.00006)

        let place = sut.sharedPlace(at: .city)

        XCTAssertEqual(place?.latitude ?? -1, 20.0, accuracy: 1e-9)
        XCTAssertNil(place?.name)
        XCTAssertNil(place?.address)
    }
}
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test --skip-sdk 2>&1 | tail -30
```

Attendu : **échec de compilation** — `value of type 'LocationPickerModel' has no member 'sharedPlace'`.

> Plus rapide pendant l'itération : `xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build` suffit à voir l'erreur de compile sans exécuter les 3 phases.

- [ ] **Step 3 : Écrire l'implémentation minimale**

Dans `LocationPickerView.swift`, ajouter la propriété au modèle, juste après `selectedCategory` :

```swift
    /// Composants du `CLPlacemark` conservés SÉPARÉMENT. `addressString` les
    /// aplatit pour l'affichage ; la dégradation de précision a besoin de
    /// choisir entre quartier, ville et région, ce qu'une chaîne jointe rend
    /// impossible.
    var selectedCoarseNames: PlaceCoarseNames = .empty { willSet { objectWillChange.send() } }
```

Remplacer le corps de `reverseGeocode` pour capter les composants dans le même
callback (aucune requête supplémentaire) :

```swift
    func reverseGeocode(_ coordinate: CLLocationCoordinate2D) {
        isGeocoding = true
        addressString = nil
        geocoder.cancelGeocode()

        let location = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        geocoder.reverseGeocodeLocation(location) { [weak self] placemarks, _ in
            let placemark = placemarks?.first
            let address = placemark.map { mark in
                let parts = [mark.name, mark.thoroughfare, mark.locality, mark.country]
                    .compactMap { $0 }
                return parts.reduce(into: [String]()) { acc, part in
                    if !acc.contains(part) { acc.append(part) }
                }.joined(separator: ", ")
            }
            let names = PlaceCoarseNames(
                subLocality: placemark?.subLocality,
                locality: placemark?.locality,
                administrativeArea: placemark?.administrativeArea,
                country: placemark?.country
            )
            Task { @MainActor [weak self] in
                self?.isGeocoding = false
                self?.selectedCoarseNames = names
                if let address { self?.addressString = address }
            }
        }
    }
```

Dans `updateSelectedLocation`, réinitialiser les composants quand le point
change — même raison que `selectedName`/`selectedCategory`, et même garde
conditionnelle pour ne pas multiplier les `objectWillChange` :

```swift
        if selectedName != nil { selectedName = nil }
        if selectedCategory != nil { selectedCategory = nil }
        if selectedCoarseNames != .empty { selectedCoarseNames = .empty }
```

Enfin, ajouter la méthode d'envoi juste après `selectedPlace` :

```swift
    /// Le lieu tel qu'il PARTIRA, précision appliquée. `selectedPlace` reste
    /// brut : conserver le brut permet de changer de précision sans
    /// re-géocoder.
    func sharedPlace(at precision: LocationPrecision) -> SharedPlace? {
        guard let place = selectedPlace else { return nil }
        return precision.coarsen(place, names: selectedCoarseNames)
    }
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```bash
cd /Users/smpceo/Documents/v2_meeshy && xcodebuild build-for-testing \
  -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" \
  -derivedDataPath apps/ios/Build -quiet 2>&1 | tail -10 && \
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyTests/LocationPickerModelTests \
  -derivedDataPath apps/ios/Build -quiet 2>&1 | tail -20
```

Attendu : **TEST SUCCEEDED**, 4 tests verts.

- [ ] **Step 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add \
  apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift \
  apps/ios/MeeshyTests/Unit/Views/LocationPickerModelTests.swift && \
git commit -m "feat(ios/location): composants geocodes separes et lieu partage a la precision choisie"
```

---

## Task 5 : Vue de réglages partagée et feuille (i)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/LocationSharingSettingsSection.swift`
- Modify: `apps/ios/Meeshy/Localizable.xcstrings`

**Interfaces:**
- Consumes: `LocationSharingPreferencesStore` (Task 2), `LocationPrecision`, `SharedMapStyle` (Task 1), `SettingsSectionHeader`, `SettingsCard`, `SettingsRow`, `SettingsSeparator` (MeeshyUI), `Platform.isIOS17OrLater`.
- Produces:
  - `struct LocationSharingSettingsSection: View` — init `(accentColor: String)`
  - `struct LocationSharingSettingsSheet: View` — init `(accentColor: String)`, s'auto-ferme via `@Environment(\.dismiss)`
  - `enum LocationSharingLabels` — `static func precisionTitle(_:) -> String`, `precisionIcon(_:) -> String`, `mapStyleTitle(_:) -> String`, `mapStyleIcon(_:) -> String`

- [ ] **Step 1 : Écrire le fichier de vue**

Créer `apps/ios/Meeshy/Features/Main/Components/LocationSharingSettingsSection.swift` :

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Libellés

/// Les libellés vivent côté APP, pas dans l'enum du SDK : une chaîne dans le
/// SDK obligerait à alimenter le catalogue `.module` et rendrait du français
/// en dur quelle que soit la langue de l'interface — le défaut que traîne
/// `LiveLocationDuration.displayText`.
enum LocationSharingLabels {

    static func precisionTitle(_ precision: LocationPrecision) -> String {
        switch precision {
        case .exact:
            return String(localized: "location.precision.exact", defaultValue: "Exacte", bundle: .main)
        case .around:
            return String(localized: "location.precision.around", defaultValue: "Autour (~100 m)", bundle: .main)
        case .neighborhood:
            return String(localized: "location.precision.neighborhood", defaultValue: "Quartier (~1 km)", bundle: .main)
        case .city:
            return String(localized: "location.precision.city", defaultValue: "Ville (~10 km)", bundle: .main)
        }
    }

    /// Libellé court, pour le suffixe collé aux coordonnées de la carte du bas.
    static func precisionBadge(_ precision: LocationPrecision) -> String {
        switch precision {
        case .exact:
            return String(localized: "location.precision.badge.exact", defaultValue: "Exacte", bundle: .main)
        case .around:
            return String(localized: "location.precision.badge.around", defaultValue: "~100 m", bundle: .main)
        case .neighborhood:
            return String(localized: "location.precision.badge.neighborhood", defaultValue: "~1 km", bundle: .main)
        case .city:
            return String(localized: "location.precision.badge.city", defaultValue: "~10 km", bundle: .main)
        }
    }

    static func precisionIcon(_ precision: LocationPrecision) -> String {
        switch precision {
        case .exact:        return "scope"
        case .around:       return "circle.dashed"
        case .neighborhood: return "house"
        case .city:         return "building.2"
        }
    }

    static func mapStyleTitle(_ style: SharedMapStyle) -> String {
        switch style {
        case .standard:
            return String(localized: "location.map-style.standard", defaultValue: "Plan", bundle: .main)
        case .hybrid:
            return String(localized: "location.map-style.hybrid", defaultValue: "Hybride", bundle: .main)
        case .imagery:
            return String(localized: "location.map-style.imagery", defaultValue: "Satellite", bundle: .main)
        }
    }

    static func mapStyleIcon(_ style: SharedMapStyle) -> String {
        switch style {
        case .standard: return "map"
        case .hybrid:   return "globe.europe.africa"
        case .imagery:  return "photo"
        }
    }
}

// MARK: - Section partagée

/// Les deux réglages de partage de position, rendus à l'identique dans la
/// feuille `(i)` du picker et dans Réglages > Confidentialité.
///
/// Bâtie sur `SettingsCard` / `SettingsRow` / `SettingsSeparator` — pas sur le
/// style local de `MediaDownloadSettingsView`. Une vue partagée entre deux
/// surfaces doit adopter le style de la plus contrainte, sinon elle jure dans
/// Confidentialité.
struct LocationSharingSettingsSection: View {
    let accentColor: String

    @ObservedObject private var store = LocationSharingPreferencesStore.shared
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxl) {
            precisionSection
            if Platform.isIOS17OrLater {
                mapStyleSection
            }
        }
    }

    // MARK: - Précision

    private var precisionSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            SettingsSectionHeader(
                title: String(localized: "location.precision.section", defaultValue: "Précision du partage", bundle: .main),
                icon: "scope",
                color: accentColor
            )

            SettingsCard(tint: accentColor) {
                ForEach(Array(LocationPrecision.allCases.enumerated()), id: \.element) { index, precision in
                    if index > 0 { SettingsSeparator(tint: accentColor) }
                    radioRow(
                        icon: LocationSharingLabels.precisionIcon(precision),
                        title: LocationSharingLabels.precisionTitle(precision),
                        isSelected: store.preferences.precision == precision
                    ) {
                        store.preferences.precision = precision
                    }
                }
            }

            Text(String(
                localized: "location.precision.footnote",
                defaultValue: "Aux niveaux Quartier et Ville, seule la zone est transmise — pas l'adresse exacte.",
                bundle: .main
            ))
            .font(MeeshyFont.relative(12))
            .foregroundColor(theme.textMuted)
            .padding(.horizontal, 4)
        }
    }

    // MARK: - Type de carte

    private var mapStyleSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            SettingsSectionHeader(
                title: String(localized: "location.map-style.section", defaultValue: "Type de carte", bundle: .main),
                icon: "map",
                color: accentColor
            )

            SettingsCard(tint: accentColor) {
                ForEach(Array(SharedMapStyle.allCases.enumerated()), id: \.element) { index, style in
                    if index > 0 { SettingsSeparator(tint: accentColor) }
                    radioRow(
                        icon: LocationSharingLabels.mapStyleIcon(style),
                        title: LocationSharingLabels.mapStyleTitle(style),
                        isSelected: store.preferences.mapStyle == style
                    ) {
                        store.preferences.mapStyle = style
                    }
                }
            }
        }
    }

    // MARK: - Ligne radio

    /// Le `Button` enveloppe la ligne entière. On n'utilise donc jamais le
    /// paramètre `info:` de `SettingsRow` ici : le bouton englobant avalerait
    /// le tap du `(i)`.
    private func radioRow(
        icon: String,
        title: String,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            SettingsRow(icon: icon, title: title, color: accentColor) {
                Image(systemName: "checkmark")
                    .font(MeeshyFont.relative(14, weight: .bold))
                    .foregroundColor(Color(hex: accentColor))
                    .opacity(isSelected ? 1 : 0)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}

// MARK: - Feuille

/// Enveloppe présentable de la section — c'est ce qu'ouvre le `(i)` du picker.
struct LocationSharingSettingsSheet: View {
    let accentColor: String

    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    LocationSharingSettingsSection(accentColor: accentColor)
                        .padding(.horizontal, MeeshySpacing.xl)
                        .padding(.top, MeeshySpacing.lg)
                        .padding(.bottom, MeeshySpacing.xxxl)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(String(localized: "location.settings.title", defaultValue: "Partage de position", bundle: .main))
                        .font(MeeshyFont.relative(16, weight: .bold))
                        .accessibilityAddTraits(.isHeader)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done", defaultValue: "Terminé", bundle: .main)) { dismiss() }
                        .foregroundColor(Color(hex: accentColor))
                }
            }
        }
    }
}
```

- [ ] **Step 2 : Vérifier que ça compile**

```bash
cd /Users/smpceo/Documents/v2_meeshy && xcodebuild build \
  -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" \
  -derivedDataPath apps/ios/Build -quiet 2>&1 | tail -15
```

Attendu : **BUILD SUCCEEDED**.

> Tokens vérifiés le 2026-08-09 : `MeeshySpacing` expose `xs/sm/md/lg/xl/xxl/xxxl`
> (4/8/12/16/20/24/32) et `MeeshyRadius` expose `sm/md/lg/xl/xxl/full` — tous
> ceux utilisés ici existent. Ne pas inventer de nouveau token.
>
> La clé `common.done` n'est PAS encore au catalogue : c'est la Task 8 qui l'y
> met. À cette étape le build passe quand même (le `defaultValue` suffit à
> compiler) ; c'est le cliquet de la Task 8 qui l'exigera.

- [ ] **Step 3 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add \
  apps/ios/Meeshy/Features/Main/Components/LocationSharingSettingsSection.swift && \
git commit -m "feat(ios/location): section de reglages partagee precision + type de carte"
```

---

## Task 6 : Picker — couleurs, layout et branchement

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/LocationPickerSourceGuardTests.swift` (créer)

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: rien de nouveau pour les tâches suivantes.

- [ ] **Step 1 : Écrire les gardes qui échouent**

Créer `apps/ios/MeeshyTests/Unit/Views/LocationPickerSourceGuardTests.swift` :

```swift
import XCTest

/// Deux régressions visuelles que rien d'autre n'attrape.
///
/// Une troisième garde — « `onSelect` ne reçoit jamais `selectedPlace` brut » —
/// a été écartée : c'est une assertion sur le TEXTE du source, que le moindre
/// `extract` casse sans qu'aucun comportement ne change.
/// `LocationPickerModelTests` couvre la même propriété par le comportement.
final class LocationPickerSourceGuardTests: XCTestCase {

    private func pickerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .appendingPathComponent("Meeshy/Features/Main/Components/LocationPickerView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Commentaires retirés : une mention de `MapUserLocationButton` dans une
    /// explication du POURQUOI ne doit pas faire échouer la garde.
    private func strippingComments(_ source: String) -> String {
        source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                guard let range = line.range(of: "//") else { return String(line) }
                return String(line[line.startIndex..<range.lowerBound])
            }
            .joined(separator: "\n")
    }

    /// Le `MapUserLocationButton` système se rend en haut-trailing, SOUS la
    /// barre de recherche flottante, où il est inatteignable — c'est le défaut
    /// signalé sur la capture du 2026-08-09. Le picker pose son propre bouton.
    func test_picker_nUtilisePlusLeBoutonDeLocalisationSysteme() throws {
        let source = strippingComments(try pickerSource())

        XCTAssertFalse(
            source.contains("MapUserLocationButton"),
            "le picker doit poser son propre contrôle de recentrage, pas celui de mapControls"
        )
    }

    /// « Ma position » de la carte du bas faisait doublon avec le contrôle de
    /// recentrage. Un seul survit.
    func test_picker_nAPlusDeBoutonMaPositionDansLaCarteDuBas() throws {
        let source = strippingComments(try pickerSource())

        XCTAssertFalse(
            source.contains("location.my-position"),
            "le bouton « Ma position » a été remplacé par le contrôle de recentrage flottant"
        )
    }
}
```

- [ ] **Step 2 : Lancer les gardes pour vérifier qu'elles échouent**

```bash
cd /Users/smpceo/Documents/v2_meeshy && xcodebuild build-for-testing \
  -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build -quiet 2>&1 | tail -5 && \
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyTests/LocationPickerSourceGuardTests \
  -derivedDataPath apps/ios/Build -quiet 2>&1 | tail -20
```

Attendu : **2 échecs** — le picker contient encore `MapUserLocationButton` (via `defaultControls` par défaut) et `location.my-position`.

- [ ] **Step 3 : Refondre la vue**

Dans `LocationPickerView.swift`, remplacer le haut de la `struct` (jusqu'à la fin de `body`) :

```swift
struct LocationPickerView: View {
    /// Couleur PRIMAIRE de la conversation — les appelants passent
    /// `conversation.accentColor`, qui est `colorPalette.primary`.
    let accentColor: String
    let onSelect: (SharedPlace) -> Void
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @StateObject private var viewModel = LocationPickerModel()
    @ObservedObject private var preferencesStore = LocationSharingPreferencesStore.shared
    @State private var searchText = ""
    @State private var mapTarget: MapTarget?
    @State private var didCenterOnUser = false
    @State private var isShowingSettings = false

    /// Couleur d'ACCENT de la conversation, dérivée du primaire par la formule
    /// officielle du SDK. `DynamicColorGenerator.colorFor(context:)` calcule
    /// `accent = shiftHue(primary, -30°)` et n'applique jamais
    /// `saturationBoost` aux hex — cette dérivation reproduit donc
    /// `conversation.colorPalette.accent` à l'identique, sans imposer un
    /// nouveau paramètre aux sept sites d'appel.
    private var secondaryAccent: String {
        DynamicColorGenerator.hueShiftedHex(accentColor, degrees: -30)
    }

    private var precision: LocationPrecision { preferencesStore.preferences.precision }

    var body: some View {
        NavigationStack {
            ZStack {
                mapView

                VStack(spacing: 0) {
                    searchBar
                    if viewModel.isLocationRefused {
                        locationDeniedBanner
                    }
                    Spacer()
                    bottomCard
                }

                floatingControls
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) { dismiss() }
                        .foregroundColor(Color(hex: accentColor))
                }
                ToolbarItem(placement: .principal) {
                    Text(String(localized: "location.title", defaultValue: "Choisir un lieu", bundle: .main))
                        .font(MeeshyFont.relative(16, weight: .bold))
                        .accessibilityAddTraits(.isHeader)
                }
            }
            .sheet(isPresented: $isShowingSettings) {
                LocationSharingSettingsSheet(accentColor: accentColor)
            }
            .onAppear { viewModel.requestPermission() }
            .onReceive(viewModel.userLocationUpdates) { loc in
                guard !didCenterOnUser else { return }
                didCenterOnUser = true
                mapTarget = MapTarget(center: loc, latitudinalMeters: 1000, longitudinalMeters: 1000)
            }
        }
    }
```

Remplacer `mapView` :

```swift
    private var mapView: some View {
        AdaptiveInteractiveMap(
            target: mapTarget,
            annotationCoordinate: viewModel.selectedCoordinate,
            style: preferencesStore.preferences.mapStyle,
            // Les contrôles système se rendent en haut-trailing, SOUS la barre
            // de recherche flottante — c'est exactement là que le bouton de
            // recentrage devenait inatteignable. On pose les nôtres.
            defaultControls: false,
            onRegionChange: { center in
                viewModel.updateSelectedLocation(center)
            }
        ) {
            Image(systemName: "mappin.circle.fill")
                .font(.system(size: 36))
                .foregroundStyle(Color(hex: accentColor), Color(hex: secondaryAccent).opacity(0.35))
                .shadow(color: Color(hex: secondaryAccent).opacity(0.45), radius: 6, y: 3)
        }
        .ignoresSafeArea(edges: .bottom)
    }
```

Ajouter la colonne de contrôles, juste après `mapView` :

```swift
    // MARK: - Contrôles flottants

    /// Colonne trailing ancrée SOUS la barre de recherche. Elle s'efface quand
    /// des résultats s'affichent : la liste a alors la priorité visuelle, et
    /// c'est le seul recouvrement accepté.
    private var floatingControls: some View {
        VStack(spacing: 10) {
            controlButton(
                icon: "info.circle",
                label: String(localized: "location.settings.open", defaultValue: "Réglages de partage de position", bundle: .main)
            ) {
                isShowingSettings = true
            }

            controlButton(
                icon: "location.fill",
                label: String(localized: "location.recenter", defaultValue: "Recentrer sur ma position", bundle: .main)
            ) {
                viewModel.centerOnUser()
                if let loc = viewModel.userLocation {
                    mapTarget = MapTarget(center: loc, latitudinalMeters: 500, longitudinalMeters: 500)
                }
            }
        }
        .padding(.trailing, 16)
        // 8 (top de la barre) + ~44 (hauteur de la barre) + 12 de respiration.
        // Le bandeau de refus de localisation s'insère SOUS la barre dans la
        // même colonne : quand il est là, la pile descend d'autant, sinon les
        // deux se chevaucheraient.
        .padding(.top, viewModel.isLocationRefused ? 124 : 64)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .opacity(viewModel.searchResults.isEmpty ? 1 : 0)
        .allowsHitTesting(viewModel.searchResults.isEmpty)
        .animation(.easeInOut(duration: 0.18), value: viewModel.searchResults.isEmpty)
    }

    private func controlButton(
        icon: String,
        label: String,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            Image(systemName: icon)
                // Chrome de carte ancré à une taille d'écran fixe, pas du texte
                // à lire : le mettre à l'échelle du Dynamic Type le décrocherait
                // de la grille de contrôles (doctrine 86i).
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Color(hex: secondaryAccent))
                .frame(width: 40, height: 40)
                .adaptiveGlass(in: Circle())
                .clipShape(Circle())
                .shadow(color: .black.opacity(0.12), radius: 6, y: 2)
                // Cible tactile Apple HIG (44 pt) sans grossir le disque
                // visible (40 pt). L'ORDRE compte : `frame` d'abord, puis
                // `contentShape` — l'inverse découperait la zone tactile sur
                // le disque de 40 et la cible resterait sous-dimensionnée.
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .accessibilityLabel(label)
    }
```

Dans `searchBar`, teinter la loupe en primaire :

```swift
            Image(systemName: "magnifyingglass")
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(Color(hex: accentColor))
                .accessibilityHidden(true)
```

Dans `searchResultsList`, teinter l'icône de résultat en accent — remplacer les
deux lignes `.foregroundColor(...)` / `.background(...)` de l'`Image(systemName: "mappin")` :

```swift
                            .foregroundColor(Color(hex: secondaryAccent))
                            .frame(width: 28, height: 28)
                            .background(Circle().fill(Color(hex: secondaryAccent).opacity(0.12)))
```

Enfin, remplacer intégralement `bottomCard` :

```swift
    private var bottomCard: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "location.fill")
                    .font(MeeshyFont.relative(14, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    if let title = displayedTitle {
                        Text(title)
                            .font(MeeshyFont.relative(13, weight: .medium))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(2)
                    } else if viewModel.isGeocoding {
                        HStack(spacing: 6) {
                            ProgressView()
                                .scaleEffect(0.7)
                            Text(String(localized: "location.geocoding", defaultValue: "Recherche de l'adresse...", bundle: .main))
                                .font(MeeshyFont.relative(12))
                                .foregroundColor(theme.textSecondary)
                        }
                    } else {
                        Text(String(localized: "location.move-prompt", defaultValue: "Deplacez la carte pour choisir", bundle: .main))
                            .font(MeeshyFont.relative(12))
                            .foregroundColor(theme.textMuted)
                    }

                    if let place = displayedPlace {
                        HStack(spacing: 6) {
                            Text(formattedCoordinates(of: place))
                                .font(MeeshyFont.relative(10, weight: .medium, design: .monospaced))
                                .foregroundColor(theme.textMuted)
                            Text("·")
                                .font(MeeshyFont.relative(10))
                                .foregroundColor(theme.textMuted)
                            Text(LocationSharingLabels.precisionBadge(precision))
                                .font(MeeshyFont.relative(10, weight: .semibold))
                                .foregroundColor(Color(hex: secondaryAccent))
                        }
                    }
                }

                Spacer()
            }
            .accessibilityElement(children: .combine)

            Button {
                guard let place = displayedPlace else { return }
                Logger(subsystem: "me.meeshy.app", category: "location")
                    .info("breadcrumb.selection hasName=\(place.name != nil, privacy: .public) precision=\(self.precision.rawValue, privacy: .public)")
                onSelect(place)
                HapticFeedback.success()
                dismiss()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark")
                        .font(MeeshyFont.relative(14, weight: .bold))
                    Text(String(localized: "common.confirm", defaultValue: "Confirmer", bundle: .main))
                        .font(MeeshyFont.relative(13, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(
                            // Le dégradé de la CONVERSATION : primaire vers
                            // accent, pas primaire vers lui-même atténué.
                            LinearGradient(
                                colors: [Color(hex: accentColor), Color(hex: secondaryAccent)],
                                startPoint: .leading, endPoint: .trailing
                            )
                        )
                        .shadow(color: Color(hex: accentColor).opacity(0.3), radius: 6, y: 3)
                )
            }
            .disabled(displayedPlace == nil)
            .opacity(displayedPlace == nil ? 0.5 : 1)
        }
        .padding(16)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.1), radius: 12, y: -4)
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    /// Ce qui PARTIRA, précision appliquée. La carte du bas montre exactement
    /// ce que le destinataire recevra — pas une valeur brute qui serait
    /// dégradée en silence au moment du tap.
    private var displayedPlace: SharedPlace? {
        viewModel.sharedPlace(at: precision)
    }

    /// Nom ET adresse, dédupliqués. Ne montrer que l'adresse perdrait le nom du
    /// quartier aux niveaux grossiers (« Gros-Caillou » disparaîtrait derrière
    /// « Paris, France ») ; ne montrer que le nom perdrait l'adresse complète au
    /// niveau exact.
    private var displayedTitle: String? {
        guard let place = displayedPlace else { return nil }
        let parts = [place.name, place.address].compactMap { $0 }.filter { !$0.isEmpty }
        let deduped = parts.reduce(into: [String]()) { acc, part in
            if !acc.contains(part) { acc.append(part) }
        }
        return deduped.isEmpty ? nil : deduped.joined(separator: " · ")
    }

    /// Le nombre de décimales suit le niveau : afficher `20.00000` pour une
    /// valeur arrondie au degré près suggérerait une précision disparue.
    private func formattedCoordinates(of place: SharedPlace) -> String {
        let places = precision.decimalPlaces ?? 5
        return String(format: "%.\(places)f, %.\(places)f", place.latitude, place.longitude)
    }
```

- [ ] **Step 4 : Lancer les gardes et les tests du modèle**

```bash
cd /Users/smpceo/Documents/v2_meeshy && xcodebuild build-for-testing \
  -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build -quiet 2>&1 | tail -5 && \
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyTests/LocationPickerSourceGuardTests \
  -only-testing:MeeshyTests/LocationPickerModelTests \
  -derivedDataPath apps/ios/Build -quiet 2>&1 | tail -20
```

Attendu : **TEST SUCCEEDED**, 6 tests verts.

- [ ] **Step 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add \
  apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift \
  apps/ios/MeeshyTests/Unit/Views/LocationPickerSourceGuardTests.swift && \
git commit -m "feat(ios/location): couleurs de conversation, controles flottants et precision dans le picker"
```

---

## Task 7 : Section « Position » dans Réglages > Confidentialité

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/PrivacySettingsView.swift`

**Interfaces:**
- Consumes: `LocationSharingSettingsSection` (Task 5).

- [ ] **Step 1 : Brancher la section**

Dans `scrollContent`, insérer `locationSection` entre `contactsSection` et
`mediaSection` :

```swift
    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: MeeshySpacing.xxl + MeeshySpacing.xs) {
                visibilitySection
                contactsSection
                locationSection
                mediaSection
                encryptionSection

                Spacer().frame(height: MeeshySpacing.xxxl + MeeshySpacing.sm)
            }
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.top, MeeshySpacing.lg)
        }
    }
```

Ajouter la section, juste après `contactsSection` :

```swift
    /// Les réglages de partage de position — la MÊME vue que celle qu'ouvre le
    /// `(i)` du sélecteur de lieu. Une seule source, deux surfaces : ce sont
    /// des préférences applicatives, pas propres à une conversation.
    ///
    /// Contrairement aux autres sections de cet écran, celle-ci est
    /// pleinement fonctionnelle — pas de « Bientôt disponible ».
    private var locationSection: some View {
        LocationSharingSettingsSection(accentColor: accentColor)
    }
```

- [ ] **Step 2 : Vérifier que ça compile**

```bash
cd /Users/smpceo/Documents/v2_meeshy && xcodebuild build \
  -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" \
  -derivedDataPath apps/ios/Build -quiet 2>&1 | tail -15
```

Attendu : **BUILD SUCCEEDED**.

- [ ] **Step 3 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add \
  apps/ios/Meeshy/Features/Main/Views/PrivacySettingsView.swift && \
git commit -m "feat(ios/settings): section Position dans Confidentialite"
```

---

## Task 8 : Catalogue de localisation et gate complet

**Files:**
- Modify: `apps/ios/Meeshy/Localizable.xcstrings`

**Interfaces:** aucune.

- [ ] **Step 1 : Ajouter les clés en 7 langues**

> **`common.done` est obligatoire.** Vérifié le 2026-08-09 : la clé est ABSENTE
> du catalogue, et son `defaultValue` « Terminé » porte un accent **et** figure
> nommément dans la liste de mots-outils de `FrenchDefaultValueRatchetTests`.
> L'introduire sans l'inscrire au catalogue fait échouer la suite à coup sûr.
>
> Pour information — ces clés voisines existent déjà en code sans être au
> catalogue (`common.confirm`, `location.title`, `location.geocoding`,
> `location.move-prompt`) : elles passent sous le radar du cliquet faute
> d'accent ou de mot-outil. C'est la dette connue « cliquet aveugle aux clés
> sans accent ». **Hors périmètre de ce lot** — ne pas l'élargir ici.

Le catalogue a `sourceLanguage: fr` et 7 langues : `ar`, `de`, `en`, `es`, `fr`,
`it`, `pt-BR`. Format d'une entrée :

```json
"ma.cle": {
  "extractionState": "manual",
  "localizations": {
    "ar": { "stringUnit": { "state": "translated", "value": "…" } },
    "de": { "stringUnit": { "state": "translated", "value": "…" } },
    "en": { "stringUnit": { "state": "translated", "value": "…" } },
    "es": { "stringUnit": { "state": "translated", "value": "…" } },
    "fr": { "stringUnit": { "state": "translated", "value": "…" } },
    "it": { "stringUnit": { "state": "translated", "value": "…" } },
    "pt-BR": { "stringUnit": { "state": "translated", "value": "…" } }
  }
}
```

Écrire ce script dans le scratchpad, y coller le tableau ci-dessous dans `ROWS`,
puis l'exécuter. Il insère les entrées et réécrit le JSON **trié par clé**
(le fichier l'est déjà — préserver l'ordre garde le diff lisible) :

```python
# /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/91c7030f-7686-493d-8ba1-89df38eeee08/scratchpad/add_location_keys.py
import json, collections

CATALOG = "/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Localizable.xcstrings"
LANGS = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]

# clé -> {langue: valeur}   (voir le tableau du plan)
ROWS = {
    # "location.precision.section": {"fr": "…", "en": "…", ...},
}

with open(CATALOG, encoding="utf-8") as f:
    catalog = json.load(f)

for key, values in ROWS.items():
    missing = set(LANGS) - set(values)
    assert not missing, f"{key}: langues manquantes {missing}"
    catalog["strings"][key] = {
        "extractionState": "manual",
        "localizations": {
            lang: {"stringUnit": {"state": "translated", "value": values[lang]}}
            for lang in LANGS
        },
    }

catalog["strings"] = collections.OrderedDict(sorted(catalog["strings"].items()))

with open(CATALOG, "w", encoding="utf-8") as f:
    json.dump(catalog, f, ensure_ascii=False, indent=2, sort_keys=False)
    f.write("\n")

print(f"{len(ROWS)} cles ecrites, {len(catalog['strings'])} au total")
```

Traductions à insérer :

| Clé | fr | en | es | de | it | pt-BR | ar |
|---|---|---|---|---|---|---|---|
| `location.precision.section` | Précision du partage | Sharing precision | Precisión del uso compartido | Freigabegenauigkeit | Precisione della condivisione | Precisão do compartilhamento | دقة المشاركة |
| `location.precision.exact` | Exacte | Exact | Exacta | Genau | Esatta | Exata | دقيقة |
| `location.precision.around` | Autour (~100 m) | Nearby (~100 m) | Alrededor (~100 m) | Umgebung (~100 m) | Dintorni (~100 m) | Arredores (~100 m) | المحيط (~100 م) |
| `location.precision.neighborhood` | Quartier (~1 km) | Neighborhood (~1 km) | Barrio (~1 km) | Viertel (~1 km) | Quartiere (~1 km) | Bairro (~1 km) | الحي (~1 كم) |
| `location.precision.city` | Ville (~10 km) | City (~10 km) | Ciudad (~10 km) | Stadt (~10 km) | Città (~10 km) | Cidade (~10 km) | المدينة (~10 كم) |
| `location.precision.badge.exact` | Exacte | Exact | Exacta | Genau | Esatta | Exata | دقيقة |
| `location.precision.badge.around` | ~100 m | ~100 m | ~100 m | ~100 m | ~100 m | ~100 m | ~100 م |
| `location.precision.badge.neighborhood` | ~1 km | ~1 km | ~1 km | ~1 km | ~1 km | ~1 km | ~1 كم |
| `location.precision.badge.city` | ~10 km | ~10 km | ~10 km | ~10 km | ~10 km | ~10 km | ~10 كم |
| `location.precision.footnote` | Aux niveaux Quartier et Ville, seule la zone est transmise — pas l'adresse exacte. | At Neighborhood and City levels, only the area is shared — not the exact address. | En los niveles Barrio y Ciudad, solo se comparte la zona, no la dirección exacta. | Auf den Stufen Viertel und Stadt wird nur das Gebiet geteilt – nicht die genaue Adresse. | Ai livelli Quartiere e Città viene condivisa solo la zona, non l'indirizzo esatto. | Nos níveis Bairro e Cidade, apenas a área é compartilhada — não o endereço exato. | في مستويي الحي والمدينة، تتم مشاركة المنطقة فقط — وليس العنوان الدقيق. |
| `location.map-style.section` | Type de carte | Map type | Tipo de mapa | Kartentyp | Tipo di mappa | Tipo de mapa | نوع الخريطة |
| `location.map-style.standard` | Plan | Map | Mapa | Karte | Mappa | Mapa | خريطة |
| `location.map-style.hybrid` | Hybride | Hybrid | Híbrido | Hybrid | Ibrida | Híbrido | مختلط |
| `location.map-style.imagery` | Satellite | Satellite | Satélite | Satellit | Satellite | Satélite | قمر صناعي |
| `location.settings.title` | Partage de position | Location sharing | Uso compartido de ubicación | Standortfreigabe | Condivisione della posizione | Compartilhamento de localização | مشاركة الموقع |
| `location.settings.open` | Réglages de partage de position | Location sharing settings | Ajustes de uso compartido de ubicación | Einstellungen für Standortfreigabe | Impostazioni di condivisione della posizione | Configurações de compartilhamento de localização | إعدادات مشاركة الموقع |
| `location.recenter` | Recentrer sur ma position | Recenter on my location | Centrar en mi ubicación | Auf meinen Standort zentrieren | Centra sulla mia posizione | Centralizar na minha localização | التوسيط على موقعي |
| `common.done` | Terminé | Done | Listo | Fertig | Fine | Concluído | تم |

Soit **17 clés**.

- [ ] **Step 2 : Vérifier le JSON et le cliquet**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy && python3 -c "
import json
d=json.load(open('Localizable.xcstrings'))
need={'ar','de','en','es','fr','it','pt-BR'}
neuves=[k for k in d['strings'] if k.startswith('location.precision.') or k.startswith('location.map-style.') or k.startswith('location.settings.') or k in ('location.recenter','common.done')]
bad=[k for k in neuves if set((d['strings'][k].get('localizations') or {}).keys()) != need]
print('cles neuves:', len(neuves), '(attendu 17)')
print('incompletes:', bad or 'aucune')
print('total cles:', len(d['strings']))
"
```

Attendu : `cles neuves: 17`, `incompletes: aucune`.

> Le filtre porte sur les clés NEUVES seulement. Les clés `location.*`
> préexistantes ne sont pas au catalogue (dette connue, hors périmètre) : les
> inclure ferait échouer cette vérification sans qu'aucune régression n'existe.

- [ ] **Step 3 : Lancer le cliquet français**

```bash
cd /Users/smpceo/Documents/v2_meeshy && xcodebuild test-without-building \
  -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyTests/FrenchDefaultValueRatchetTests \
  -derivedDataPath apps/ios/Build -quiet 2>&1 | tail -20
```

Attendu : **TEST SUCCEEDED**.

> Si une clé est signalée, c'est qu'elle est utilisée en code avec un
> `defaultValue` français mais absente du catalogue. L'ajouter — ne jamais
> l'inscrire dans `FrenchDefaultValueDebt.json`, la liste ne peut que rétrécir.

- [ ] **Step 4 : Gate complet**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate && cd /Users/smpceo/Documents/v2_meeshy && \
./apps/ios/meeshy.sh test 2>&1 | tail -40
```

Attendu : les 4 phases vertes (phase 0 SDK incluse).

Puis nettoyer le churn de génération — **ne jamais le committer** (worktree partagé) :

```bash
cd /Users/smpceo/Documents/v2_meeshy && git status --short && \
git checkout -- apps/ios/Meeshy.xcodeproj/project.pbxproj \
  apps/ios/Meeshy.xcodeproj/xcshareddata/xcschemes/Meeshy.xcscheme 2>/dev/null; \
git checkout -- apps/ios/Meeshy.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved 2>/dev/null; true
```

- [ ] **Step 5 : Commit et push**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add apps/ios/Meeshy/Localizable.xcstrings && \
git commit -m "i18n(ios/location): cles de precision de partage et de type de carte en 7 langues" && \
git push origin main
```

---

## Vérification finale

- [ ] `./apps/ios/meeshy.sh test` — 4 phases vertes.
- [ ] Contrôle visuel au simulateur (`./apps/ios/meeshy.sh run`), depuis une conversation → composer → Localisation :
  - la barre de recherche ne recouvre plus rien ; `ⓘ` et `⌖` sont visibles et cliquables sous elle ;
  - taper une recherche fait disparaître la colonne, l'effacer la fait revenir ;
  - le CTA « Confirmer » montre un dégradé à deux teintes, pas un aplat ;
  - « Ma position » a disparu de la carte du bas ;
  - le `(i)` ouvre la feuille ; changer la précision met à jour les coordonnées et le badge en direct ;
  - changer le type de carte change le rendu derrière la feuille ;
  - fermer et rouvrir l'app conserve les deux réglages ;
  - Réglages > Confidentialité montre la même section, fonctionnelle.
- [ ] `git status` ne montre que le WIP d'autres sessions.
