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
