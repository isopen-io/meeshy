import XCTest
@testable import MeeshySDK

/// Les deux routes de découverte géographique (`GET /posts/nearby`,
/// `GET /posts/nearby/density`), vues depuis le client.
///
/// Trois choses s'y jouent, et aucune ne se voit dans une struct :
///
/// 1. **La pagination de `/posts/nearby` n'est PAS celle du feed.** Le gateway
///    y attend un OFFSET numérique (`z.coerce.number().int().min(0)`), pas le
///    curseur opaque `createdAt+id`. Envoyer un curseur de feed rendrait
///    400 VALIDATION_ERROR — un écran vide de plus, sans cause lisible.
///
/// 2. **La réponse fusionne `distanceMeters` DANS l'objet post.** `APIPost` ne
///    connaît pas cette clé et n'a aucune raison de la connaître : c'est une
///    propriété de la RELATION entre un lecteur et un post, pas du post.
///    D'où le double décodage du même conteneur.
///
/// 3. **La taille de cellule est CALÉE par le serveur sur trois paliers.** Un
///    client qui demande 37 km reçoit des cellules de 100 km sans le savoir,
///    et sa clé de cache — quantifiée sur une grille de 37 km — ne retomberait
///    jamais sur les mêmes cellules. Le client cale donc AVANT de demander.
final class NearbyDiscoveryServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: NearbyDiscoveryService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = NearbyDiscoveryService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func queryValue(_ name: String) -> String? {
        mock.lastRequest?.queryItems?.first(where: { $0.name == name })?.value
    }

    private static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    private static let nearbyPayload = """
    {
      "success": true,
      "data": [
        {
          "id": "post-1",
          "type": "POST",
          "content": "Vue sur le lac",
          "createdAt": "2026-08-24T10:00:00Z",
          "author": { "id": "a1", "username": "alice" },
          "location": { "latitude": 48.8583736, "longitude": 2.2944813, "name": "12 rue de la Paix" },
          "geoPoint": { "type": "Point", "coordinates": [2, 49] },
          "geoPrecision": "REGION",
          "distanceMeters": 1843.75
        },
        {
          "id": "post-2",
          "type": "REEL",
          "content": "Plus loin",
          "createdAt": "2026-08-24T09:00:00Z",
          "author": { "id": "a2", "username": "bob" }
        }
      ],
      "pagination": { "nextCursor": "20", "hasMore": true, "limit": 20 },
      "error": null
    }
    """

    private static let densityPayload = """
    {
      "success": true,
      "data": [
        { "cellLat": 48.9, "cellLng": 2.3, "count": 12 },
        { "cellLat": 48.8, "cellLng": 2.4, "count": 3 }
      ],
      "error": null
    }
    """

    private func stubNearby() throws {
        let page = try Self.decoder().decode(
            PaginatedAPIResponse<[NearbyPost]>.self,
            from: Data(Self.nearbyPayload.utf8)
        )
        mock.stub("/posts/nearby", result: page)
    }

    private func stubDensity() throws {
        let response = try Self.decoder().decode(
            APIResponse<[NearbyDensityCell]>.self,
            from: Data(Self.densityPayload.utf8)
        )
        mock.stub("/posts/nearby/density", result: response)
    }

    // MARK: - La charge de requête

    func test_nearby_buildsQueryItems_withNumericOffsetCursorAndCappedLimit() async throws {
        try stubNearby()

        _ = try await service.nearby(
            latitude: 48.8583736,
            longitude: 2.2944813,
            radiusKm: 25,
            cursor: 40,
            limit: 500
        )

        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/nearby")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(queryValue("lat"), "48.8583736")
        XCTAssertEqual(queryValue("lng"), "2.2944813")
        XCTAssertEqual(queryValue("radiusKm"), "25.0")
        XCTAssertEqual(queryValue("cursor"), "40", "l'offset est numérique, jamais un curseur de feed")
        XCTAssertEqual(
            queryValue("limit"), "50",
            "le gateway plafonne limit à 50 ; au-delà il rend 400, pas une page tronquée"
        )
    }

    /// La coordonnée part au chiffre près. Ce test est la jumelle en LECTURE
    /// de celui qui garde l'écriture : le client ne quantifie rien, ni en
    /// publiant, ni en cherchant.
    func test_nearby_sendsTheCoordinateUnrounded() async throws {
        try stubNearby()

        _ = try await service.nearby(
            latitude: -33.8688197,
            longitude: 151.2092955,
            radiusKm: 1,
            cursor: 0,
            limit: 20
        )

        XCTAssertEqual(queryValue("lat"), "-33.8688197")
        XCTAssertEqual(queryValue("lng"), "151.2092955")
    }

    func test_nearby_clampsRadiusToTheServerMaximum() async throws {
        try stubNearby()

        _ = try await service.nearby(
            latitude: 0, longitude: 0, radiusKm: 99_999, cursor: 0, limit: 20
        )

        XCTAssertEqual(queryValue("radiusKm"), "20000.0")
    }

    func test_nearby_clampsCursorAndLimitToTheirLowerBounds() async throws {
        try stubNearby()

        _ = try await service.nearby(
            latitude: 0, longitude: 0, radiusKm: 5, cursor: -12, limit: 0
        )

        XCTAssertEqual(queryValue("cursor"), "0")
        XCTAssertEqual(queryValue("limit"), "1")
    }

    // MARK: - La réponse

    func test_nearby_decodesPostAndDistanceMeters() async throws {
        try stubNearby()

        let page = try await service.nearby(
            latitude: 48.85, longitude: 2.29, radiusKm: 10, cursor: 0, limit: 20
        )

        XCTAssertEqual(page.data.count, 2)
        XCTAssertEqual(page.data[0].id, "post-1")
        XCTAssertEqual(page.data[0].post.content, "Vue sur le lac")
        XCTAssertEqual(page.data[0].distanceMeters, 1843.75)
        XCTAssertEqual(page.data[1].id, "post-2")
        XCTAssertNil(
            page.data[1].distanceMeters,
            "une distance absente reste absente — jamais 0, qui se lirait « ici même »"
        )
        XCTAssertEqual(page.pagination?.nextCursor, "20")
    }

    // MARK: - Le point CONSENTI voyage, et dans le bon ordre

    /// **GeoJSON écrit la longitude EN PREMIER.** L'inverse de toutes les
    /// signatures `CLLocationCoordinate2D` du dépôt — et le lire à l'envers ne
    /// lève aucune erreur : il déplace simplement chaque publication à un
    /// endroit plausible du globe, ce que personne ne remarque avant une
    /// capture d'écran.
    ///
    /// L'écart avec le badge est délibéré dans la charge de test : c'est
    /// exactement ce que le pin doit préférer. `location` porte la coordonnée
    /// d'AFFICHAGE (48,8583736 / 2,2944813) ; `geoPoint` porte le point
    /// consenti, quantifié à 1° (49 / 2).
    func test_nearby_decodesTheConsentedPoint_longitudeFirst() async throws {
        try stubNearby()

        let page = try await service.nearby(
            latitude: 48.85, longitude: 2.29, radiusKm: 10, cursor: 0, limit: 20
        )

        XCTAssertEqual(page.data[0].geoPoint, NearbyGeoPoint(latitude: 49, longitude: 2))
        XCTAssertEqual(page.data[0].geoPrecision, .region)
        XCTAssertNotEqual(
            page.data[0].geoPoint?.latitude, page.data[0].post.location?.latitude,
            "le point consenti et le badge affiché sont DEUX données distinctes"
        )
    }

    /// Une publication sans découvrabilité déclarée n'invente rien.
    func test_nearby_withoutAConsentedPoint_claimsNothing() async throws {
        try stubNearby()

        let page = try await service.nearby(
            latitude: 48.85, longitude: 2.29, radiusKm: 10, cursor: 0, limit: 20
        )

        XCTAssertNil(page.data[1].geoPoint)
        XCTAssertNil(page.data[1].geoPrecision)
    }

    /// **Un `geoPoint` illisible ne doit pas faire DISPARAÎTRE la
    /// publication.** `kotlinx`-style, un décodeur strict échoue sur le
    /// document entier : le post s'évanouirait du résultat, et la carte
    /// paraîtrait simplement moins peuplée. Le champ est donc toléré absent,
    /// explicitement, et l'anomalie part au journal.
    func test_nearby_withAMalformedConsentedPoint_keepsThePost() throws {
        let payload = """
        {
          "id": "post-3",
          "type": "POST",
          "content": "Toujours là",
          "createdAt": "2026-08-24T10:00:00Z",
          "author": { "id": "a3", "username": "carol" },
          "geoPoint": { "type": "Point", "coordinates": [2] },
          "geoPrecision": "GALAXY",
          "distanceMeters": 12
        }
        """

        let post = try Self.decoder().decode(NearbyPost.self, from: Data(payload.utf8))

        XCTAssertEqual(post.id, "post-3")
        XCTAssertEqual(post.distanceMeters, 12)
        XCTAssertNil(post.geoPoint)
        XCTAssertNil(post.geoPrecision)
    }

    /// Le halo n'est dessiné QUE lorsqu'il y a une zone à cerner, et sa taille
    /// suit la grille du serveur.
    func test_haloRadius_existsForEveryQuantizedTier_andNotForExact() {
        XCTAssertNil(DiscoverabilityPrecision.exact.haloRadiusMeters)
        for tier in DiscoverabilityPrecision.allCases where tier != .exact {
            XCTAssertNotNil(tier.haloRadiusMeters, "\(tier.rawValue) n'a pas de zone à dessiner")
        }
        XCTAssertGreaterThan(
            DiscoverabilityPrecision.region.haloRadiusMeters ?? 0,
            DiscoverabilityPrecision.city.haloRadiusMeters ?? 0
        )
        XCTAssertGreaterThan(
            DiscoverabilityPrecision.city.haloRadiusMeters ?? 0,
            DiscoverabilityPrecision.neighborhood.haloRadiusMeters ?? 0
        )
    }

    func test_nextOffset_readsTheNumericCursorBack() {
        XCTAssertEqual(NearbyDiscoveryPage.nextOffset(from: "20"), 20)
        XCTAssertNil(NearbyDiscoveryPage.nextOffset(from: nil))
        XCTAssertNil(
            NearbyDiscoveryPage.nextOffset(from: "eyJjcmVhdGVkQXQi"),
            "un curseur opaque de feed n'est pas un offset : mieux vaut arrêter la pagination que rendre 400"
        )
    }

    func test_nearbyDensity_decodesCells() async throws {
        try stubDensity()

        let cells = try await service.density(
            latitude: 48.85, longitude: 2.29, radiusKm: 25, cellSize: .city
        )

        XCTAssertEqual(cells.count, 2)
        XCTAssertEqual(cells[0], NearbyDensityCell(cellLat: 48.9, cellLng: 2.3, count: 12))
        XCTAssertEqual(cells[1].count, 3)
    }

    func test_nearbyDensity_sendsTheSnappedCellSize() async throws {
        try stubDensity()

        _ = try await service.density(
            latitude: 48.85, longitude: 2.29, radiusKm: 25, cellSize: .city
        )

        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/nearby/density")
        XCTAssertEqual(queryValue("cellSizeKm"), "10.0")
    }

    // MARK: - La grille

    /// `resolveDensityGridStepDegrees` (gateway) cale sur trois paliers et
    /// n'expose PAS `EXACT` : une densité sans regroupement dégénère en un
    /// point par post. Le client offre donc exactement ces trois-là.
    func test_densityCellSize_snapsToServerTiers() {
        XCTAssertEqual(NearbyDensityCellSize.forRadius(kilometers: 0.5), .neighborhood)
        XCTAssertEqual(NearbyDensityCellSize.forRadius(kilometers: 5), .neighborhood)
        XCTAssertEqual(NearbyDensityCellSize.forRadius(kilometers: 5.1), .city)
        XCTAssertEqual(NearbyDensityCellSize.forRadius(kilometers: 50), .city)
        XCTAssertEqual(NearbyDensityCellSize.forRadius(kilometers: 50.1), .region)
        XCTAssertEqual(NearbyDensityCellSize.forRadius(kilometers: 12_000), .region)
    }

    func test_densityCellSize_kilometresMatchTheServerBoundaries() {
        XCTAssertEqual(NearbyDensityCellSize.neighborhood.kilometers, 1)
        XCTAssertEqual(NearbyDensityCellSize.city.kilometers, 10)
        XCTAssertEqual(NearbyDensityCellSize.region.kilometers, 100)
    }

    func test_densityCellSize_degreesMirrorTheServerGrid() {
        XCTAssertEqual(NearbyDensityCellSize.neighborhood.degrees, 0.01, accuracy: 1e-12)
        XCTAssertEqual(NearbyDensityCellSize.city.degrees, 0.1, accuracy: 1e-12)
        XCTAssertEqual(NearbyDensityCellSize.region.degrees, 1, accuracy: 1e-12)
    }

    // MARK: - La clé de cache

    /// Sans quantification, chaque micro-déplacement de carte fabrique une clé
    /// neuve : le cache ne touche JAMAIS, et l'écran repart d'un squelette à
    /// chaque geste. C'est le défaut qui transforme un écran cache-first en
    /// écran réseau-seul sans que rien ne le dise.
    func test_cacheKey_isQuantizedToTheDensityGrid() {
        let a = NearbyDiscoveryQuery.cacheKey(
            latitude: 48.8583736, longitude: 2.2944813, radiusKm: 25
        )
        let b = NearbyDiscoveryQuery.cacheKey(
            latitude: 48.8591000, longitude: 2.2951000, radiusKm: 25
        )
        XCTAssertEqual(a, b, "deux centres dans la MÊME cellule partagent une clé")
    }

    func test_cacheKey_separatesDistinctCells() {
        let here = NearbyDiscoveryQuery.cacheKey(
            latitude: 48.85, longitude: 2.29, radiusKm: 25
        )
        let elsewhere = NearbyDiscoveryQuery.cacheKey(
            latitude: 43.30, longitude: 5.37, radiusKm: 25
        )
        XCTAssertNotEqual(here, elsewhere)
    }

    func test_cacheKey_separatesRadii() {
        let near = NearbyDiscoveryQuery.cacheKey(latitude: 48.85, longitude: 2.29, radiusKm: 5)
        let far = NearbyDiscoveryQuery.cacheKey(latitude: 48.85, longitude: 2.29, radiusKm: 100)
        XCTAssertNotEqual(
            near, far,
            "un même centre à deux rayons ne rend pas le même jeu de résultats"
        )
    }

    func test_cacheKey_isNamespaced() {
        let key = NearbyDiscoveryQuery.cacheKey(latitude: 48.85, longitude: 2.29, radiusKm: 25)
        XCTAssertTrue(
            key.hasPrefix("nearby:"),
            "le magasin de feed est partagé — sans préfixe, la clé écraserait « main-feed » ou « bookmarks »"
        )
    }
}
