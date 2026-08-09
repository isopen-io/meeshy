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
