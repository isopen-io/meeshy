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

/// Composition du titre affiché sur la carte du bas.
///
/// `reverseGeocode` construit `addressString` en partant de `placemark.name` —
/// l'adresse CONTIENT donc déjà le nom du lieu. Concaténer nom et adresse sans
/// s'en apercevoir affiche « Tour Eiffel · Tour Eiffel, Champ de Mars, … » dès
/// qu'un lieu est choisi dans les résultats de recherche, le chemin le plus
/// courant.
final class LocationPlaceTitleTests: XCTestCase {

    func test_placeTitle_sansNom_rendLAdresse() {
        XCTAssertEqual(
            LocationSharingLabels.placeTitle(name: nil, address: "Paris, France"),
            "Paris, France"
        )
    }

    func test_placeTitle_sansAdresse_rendLeNom() {
        XCTAssertEqual(
            LocationSharingLabels.placeTitle(name: "Gros-Caillou", address: nil),
            "Gros-Caillou"
        )
    }

    func test_placeTitle_sansRien_rendNil() {
        XCTAssertNil(LocationSharingLabels.placeTitle(name: nil, address: nil))
    }

    func test_placeTitle_distincts_lesJoint() {
        XCTAssertEqual(
            LocationSharingLabels.placeTitle(name: "Gros-Caillou", address: "Paris, France"),
            "Gros-Caillou · Paris, France"
        )
    }

    func test_placeTitle_adresseContenantDejaLeNom_neRepetePas() {
        XCTAssertEqual(
            LocationSharingLabels.placeTitle(
                name: "Tour Eiffel",
                address: "Tour Eiffel, Champ de Mars, Paris, France"
            ),
            "Tour Eiffel, Champ de Mars, Paris, France"
        )
    }

    func test_placeTitle_containmentInsensibleALaCasse() {
        XCTAssertEqual(
            LocationSharingLabels.placeTitle(name: "tour eiffel", address: "Tour Eiffel, Paris"),
            "Tour Eiffel, Paris"
        )
    }

    func test_placeTitle_chainesVides_traiteesCommeAbsentes() {
        XCTAssertEqual(LocationSharingLabels.placeTitle(name: "   ", address: "Paris"), "Paris")
        XCTAssertEqual(LocationSharingLabels.placeTitle(name: "Paris", address: "  "), "Paris")
        XCTAssertNil(LocationSharingLabels.placeTitle(name: "", address: "   "))
    }
}
