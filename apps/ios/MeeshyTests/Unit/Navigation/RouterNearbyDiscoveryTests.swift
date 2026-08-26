import XCTest
import CoreLocation
@testable import Meeshy

/// La route de découverte à proximité, sur le modèle EXACT de
/// `.peopleDiscovery(initialTab:)` que la spec désigne (§4).
///
/// Une difficulté qui n'existe pas pour `peopleDiscovery` : `Route` est
/// `Hashable` et `CLLocationCoordinate2D` ne l'est PAS — ni `Equatable`. Une
/// coordonnée ne peut donc pas voyager telle quelle dans une case d'énumération
/// de route ; il lui faut un porteur comparable, sans quoi `Route` cesse d'être
/// `Hashable` et TOUTE la pile de navigation cesse de compiler.
@MainActor
final class RouterNearbyDiscoveryTests: XCTestCase {

    private static let eiffel = CLLocationCoordinate2D(latitude: 48.8583736, longitude: 2.2944813)

    // MARK: - La route est comparable, avec et sans coordonnée

    func test_route_nearbyDiscovery_isHashableWithAndWithoutCoordinate() {
        let anywhere = Route.nearbyDiscovery()
        let here = Route.nearbyDiscovery(initialCoordinate: RouteCoordinate(Self.eiffel))

        XCTAssertEqual(anywhere, Route.nearbyDiscovery())
        XCTAssertEqual(here, Route.nearbyDiscovery(initialCoordinate: RouteCoordinate(Self.eiffel)))
        XCTAssertNotEqual(anywhere, here)
        XCTAssertEqual(Set([anywhere, here, anywhere]).count, 2)
    }

    func test_route_nearbyDiscovery_defaultsToNoCoordinate() {
        XCTAssertEqual(Route.nearbyDiscovery(), .nearbyDiscovery(initialCoordinate: nil))
    }

    func test_routeCoordinate_roundTripsThroughCoreLocation() {
        let wrapped = RouteCoordinate(Self.eiffel)

        XCTAssertEqual(wrapped.coordinate.latitude, Self.eiffel.latitude, accuracy: 1e-12)
        XCTAssertEqual(wrapped.coordinate.longitude, Self.eiffel.longitude, accuracy: 1e-12)
    }

    /// Aucun arrondi, nulle part — la règle du §2 vaut aussi pour un simple
    /// transport de navigation : une coordonnée dégradée en chemin donnerait un
    /// écran centré ailleurs que le lieu touché.
    func test_routeCoordinate_keepsEveryDecimal() {
        XCTAssertEqual(RouteCoordinate(Self.eiffel).latitude, 48.8583736)
        XCTAssertEqual(RouteCoordinate(Self.eiffel).longitude, 2.2944813)
    }

    // MARK: - Le reste du contrat Route

    func test_route_nearbyDiscovery_hasDisplayTitle() {
        XCTAssertFalse(Route.nearbyDiscovery().displayTitle.isEmpty)
        XCTAssertEqual(
            Route.nearbyDiscovery().displayTitle,
            Route.nearbyDiscovery(initialCoordinate: RouteCoordinate(Self.eiffel)).displayTitle,
            "le titre ne dépend pas du point de départ"
        )
    }

    /// PAS un hub : sur iPad, un hub s'ouvre dans le panneau de droite et se
    /// remplace lui-même. Une carte pré-centrée sur un post est une
    /// destination PROFONDE — la ranger parmi les hubs effacerait le contexte
    /// d'où elle a été ouverte.
    func test_route_nearbyDiscovery_isNotAHub() {
        XCTAssertFalse(Route.nearbyDiscovery().isHub)
        XCTAssertFalse(Route.nearbyDiscovery(initialCoordinate: RouteCoordinate(Self.eiffel)).isHub)
    }

    func test_route_nearbyDiscovery_hasItsOwnAnalyticsName() {
        XCTAssertEqual(Route.nearbyDiscovery().analyticsScreenName, "NearbyDiscovery")
        XCTAssertNotEqual(
            Route.nearbyDiscovery().analyticsScreenName,
            Route.peopleDiscovery().analyticsScreenName
        )
    }

    // MARK: - La pile de navigation

    func test_push_nearbyDiscovery_landsOnTheStack() {
        let router = Router()

        router.push(.nearbyDiscovery(initialCoordinate: RouteCoordinate(Self.eiffel)))

        XCTAssertEqual(router.path.last, .nearbyDiscovery(initialCoordinate: RouteCoordinate(Self.eiffel)))
    }
}
