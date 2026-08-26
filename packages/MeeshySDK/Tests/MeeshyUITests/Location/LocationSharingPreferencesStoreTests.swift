import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// Persistance des préférences de partage de position. Les statiques
/// `load`/`save` prennent un `UserDefaults` injectable : tester le singleton
/// écrirait dans les defaults réels du simulateur et polluerait les autres
/// suites.
@MainActor
final class LocationSharingPreferencesStoreTests: XCTestCase {

    /// Suite dédiée, purgée à chaque appel — pas d'état partagé entre tests.
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

    // MARK: - Dernier grain de découvrabilité (spec 2026-08-02 §2)

    /// La spec demande une préférence LOCALE au device, pas un réglage
    /// serveur — d'où ce champ ici plutôt qu'un second magasin. Le grain de
    /// partage (`precision`) et le grain de découvrabilité sont lus ENSEMBLE
    /// à chaque publication : le premier borne ce que le second peut
    /// revendiquer. Les séparer aurait fabriqué deux magasins à garder
    /// synchronisés pour une seule décision.
    func test_dernierGrainDeDecouvrabilite_faitLAllerRetour() {
        let defaults = makeDefaults()
        let prefs = LocationSharingPreferences(
            precision: .exact,
            mapStyle: .standard,
            lastDiscoverabilityPrecision: .neighborhood
        )

        LocationSharingPreferencesStore.save(prefs, userDefaults: defaults)
        let loaded = LocationSharingPreferencesStore.load(userDefaults: defaults)

        XCTAssertEqual(loaded.lastDiscoverabilityPrecision, .neighborhood)
        XCTAssertEqual(loaded, prefs)
    }

    /// Aucune mémoire par défaut : rien de découvrable n'a jamais été choisi.
    func test_defauts_naucunGrainDeDecouvrabiliteMemorise() {
        XCTAssertNil(LocationSharingPreferences.defaults.lastDiscoverabilityPrecision)
    }

    /// Non-régression du décodage : un enregistrement écrit AVANT ce champ
    /// doit continuer de se lire. Sans l'optionnalité, tout utilisateur
    /// existant retomberait sur les défauts et perdrait en silence son grain
    /// de partage — une régression de VIE PRIVÉE, pas un simple oubli.
    func test_load_enregistrementAnterieurAuChamp_gardeLeGrainDePartage() {
        let defaults = makeDefaults()
        defaults.set(Data(#"{"precision":"city","mapStyle":"imagery"}"#.utf8),
                     forKey: LocationSharingPreferencesStore.storageKey)

        let loaded = LocationSharingPreferencesStore.load(userDefaults: defaults)

        XCTAssertEqual(loaded.precision, .city)
        XCTAssertEqual(loaded.mapStyle, .imagery)
        XCTAssertNil(loaded.lastDiscoverabilityPrecision)
    }

    /// Un grain inconnu laissé par une version future ne doit pas emporter
    /// tout le reste : c'est un `DiscoverabilityPrecision?`, et l'échec de
    /// décodage d'un champ optionnel jette pourtant l'objet ENTIER en Swift.
    /// Le témoin fixe le comportement attendu — retomber sur les défauts —
    /// plutôt que de laisser croire que le champ seul serait ignoré.
    func test_load_grainDeDecouvrabiliteInconnu_retombeSurLesDefauts() {
        let defaults = makeDefaults()
        defaults.set(
            Data(#"{"precision":"city","mapStyle":"standard","lastDiscoverabilityPrecision":"GALAXIE"}"#.utf8),
            forKey: LocationSharingPreferencesStore.storageKey
        )

        let loaded = LocationSharingPreferencesStore.load(userDefaults: defaults)

        XCTAssertEqual(loaded, LocationSharingPreferences.defaults)
    }
}
