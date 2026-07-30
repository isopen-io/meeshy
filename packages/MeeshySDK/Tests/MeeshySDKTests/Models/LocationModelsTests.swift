import XCTest
import CoreLocation
@testable import MeeshySDK

final class LocationModelsTests: XCTestCase {

    // MARK: - MeeshyLocationCoordinate

    func testLocationCoordinateInit() {
        let coord = MeeshyLocationCoordinate(latitude: 48.8566, longitude: 2.3522, altitude: 35.0, accuracy: 10.0)

        XCTAssertEqual(coord.latitude, 48.8566)
        XCTAssertEqual(coord.longitude, 2.3522)
        XCTAssertEqual(coord.altitude, 35.0)
        XCTAssertEqual(coord.accuracy, 10.0)
    }

    func testLocationCoordinateInitWithDefaults() {
        let coord = MeeshyLocationCoordinate(latitude: 40.7128, longitude: -74.0060)

        XCTAssertNil(coord.altitude)
        XCTAssertNil(coord.accuracy)
    }

    func testLocationCoordinateCodableRoundtrip() throws {
        let original = MeeshyLocationCoordinate(latitude: 48.8566, longitude: 2.3522, altitude: 35.0, accuracy: 10.0)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(MeeshyLocationCoordinate.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func testLocationCoordinateEquatable() {
        let a = MeeshyLocationCoordinate(latitude: 48.8566, longitude: 2.3522)
        let b = MeeshyLocationCoordinate(latitude: 48.8566, longitude: 2.3522)
        let c = MeeshyLocationCoordinate(latitude: 51.5074, longitude: -0.1278)

        XCTAssertEqual(a, b)
        XCTAssertNotEqual(a, c)
    }

    func testLocationCoordinateCLLocationCoordinate() {
        let coord = MeeshyLocationCoordinate(latitude: 48.8566, longitude: 2.3522)
        let cl = coord.clLocationCoordinate

        XCTAssertEqual(cl.latitude, 48.8566)
        XCTAssertEqual(cl.longitude, 2.3522)
    }

    // MARK: - SharedPlace

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

    // MARK: - APIMessage.location (lieu partage hisse par le gateway)

    /// Le décodeur est celui de la PRODUCTION (`APIClient.makeAPIPayloadDecoder`).
    /// Un `JSONDecoder` local en `.iso8601` refuse les fractions de seconde que
    /// le gateway émet (`…T10:00:00.000Z`) : le test échouait alors sur sa propre
    /// fixture, pas sur le code produit.
    func test_apiMessage_decodesTopLevelLocation() throws {
        let json = Data("""
        {"id":"m1","conversationId":"c1","senderId":"u1","content":"ici",
         "createdAt":"2026-07-29T10:00:00.000Z",
         "location":{"latitude":48.8566,"longitude":2.3522,"name":"Tour Eiffel"}}
        """.utf8)
        let message = try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: json)
        XCTAssertEqual(message.location?.name, "Tour Eiffel")
    }

    func test_apiMessage_withoutLocationDecodesToNil() throws {
        let json = Data("""
        {"id":"m1","conversationId":"c1","senderId":"u1","content":"ici",
         "createdAt":"2026-07-29T10:00:00.000Z"}
        """.utf8)
        let message = try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: json)
        XCTAssertNil(message.location)
    }

    /// Verrou du décodeur de production : une régression vers `.iso8601` nu
    /// ferait re-échouer TOUT payload REST daté par le gateway.
    func test_apiPayloadDecoder_acceptsFractionalSecondsFromTheGateway() throws {
        let json = Data(#"{"createdAt":"2026-07-29T10:00:00.000Z"}"#.utf8)
        struct Probe: Decodable { let createdAt: Date }
        let probe = try APIClient.makeAPIPayloadDecoder().decode(Probe.self, from: json)
        XCTAssertEqual(probe.createdAt.timeIntervalSince1970, 1785319200, accuracy: 1)
    }

    // MARK: - LiveLocationDuration

    func testLiveLocationDurationAllCases() {
        let cases = LiveLocationDuration.allCases
        XCTAssertEqual(cases.count, 5)

        let rawValues = cases.map(\.rawValue)
        XCTAssertEqual(rawValues, [15, 30, 60, 120, 480])
    }

    func testLiveLocationDurationDisplayText() {
        XCTAssertEqual(LiveLocationDuration.fifteenMinutes.displayText, "15 min")
        XCTAssertEqual(LiveLocationDuration.thirtyMinutes.displayText, "30 min")
        XCTAssertEqual(LiveLocationDuration.oneHour.displayText, "1 heure")
        XCTAssertEqual(LiveLocationDuration.twoHours.displayText, "2 heures")
        XCTAssertEqual(LiveLocationDuration.eightHours.displayText, "8 heures")
    }

    // MARK: - LiveLocationStartPayload

    func testLiveLocationStartPayloadEncoding() throws {
        let payload = LiveLocationStartPayload(
            conversationId: "conv1",
            latitude: 48.8566,
            longitude: 2.3522,
            durationMinutes: 60
        )

        let data = try JSONEncoder().encode(payload)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        XCTAssertEqual(dict["conversationId"] as? String, "conv1")
        XCTAssertEqual(dict["durationMinutes"] as? Int, 60)
    }

    // MARK: - ActiveLiveLocation

    func testActiveLiveLocationIsExpiredWithPastDate() {
        let location = ActiveLiveLocation(
            userId: "user1",
            username: "alice",
            latitude: 48.8566,
            longitude: 2.3522,
            expiresAt: Date().addingTimeInterval(-60),
            startedAt: Date().addingTimeInterval(-3600)
        )

        XCTAssertTrue(location.isExpired)
        XCTAssertEqual(location.remainingTime, 0)
    }

    func testActiveLiveLocationIsNotExpiredWithFutureDate() {
        let location = ActiveLiveLocation(
            userId: "user2",
            username: "bob",
            latitude: 40.7128,
            longitude: -74.0060,
            expiresAt: Date().addingTimeInterval(3600),
            startedAt: Date()
        )

        XCTAssertFalse(location.isExpired)
        XCTAssertGreaterThan(location.remainingTime, 0)
    }

    func testActiveLiveLocationIdEqualsUserId() {
        let location = ActiveLiveLocation(
            userId: "user3",
            username: "charlie",
            latitude: 0,
            longitude: 0,
            expiresAt: Date().addingTimeInterval(60),
            startedAt: Date()
        )

        XCTAssertEqual(location.id, "user3")
    }

    // MARK: - ClientInfoProvider.enrichWithLocation (garde de source)

    /// Avant correctif, `enrichWithLocation` instanciait un `CLLocationManager()`
    /// JETABLE à CHAQUE appel — c'est-à-dire à CHAQUE requête API construisant
    /// ses en-têtes. Le garde `status == .authorizedWhenInUse` sortait toujours
    /// avant l'octroi de l'autorisation (le chemin dormait) ; dès l'octroi, ce
    /// code s'exécute pour la première fois ET sur toutes les requêtes API en
    /// vol simultanément — c'est le seul chemin réveillé globalement par
    /// l'octroi, hors du picker lui-même, donc le suspect n°1 du crash « juste
    /// après avoir accordé la permission ».
    ///
    /// Deux défauts corrigés ici : (1) un manager instancié par requête plutôt
    /// qu'une instance durable rattachée à une runloop — CoreLocation n'aime
    /// pas les managers éphémères créés/détruits en rafale ; (2) l'absence de
    /// cache négatif — un échec de géocodage relançait le cycle CoreLocation +
    /// réseau complet à la requête suivante, donc potentiellement des dizaines
    /// de fois par seconde sur un flux de requêtes API.
    func testClientInfoProviderReusesASingleLocationManagerWithNegativeCache() throws {
        // Depuis ce fichier de test : Models -> MeeshySDKTests -> Tests -> MeeshySDK -> packages
        // Donc 4 `deletingLastPathComponent()` (en comptant celle qui retire le
        // nom de fichier) pour atteindre `packages/MeeshySDK`, pas 5.
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Models/ -> retire le fichier
            .deletingLastPathComponent()  // MeeshySDKTests/
            .deletingLastPathComponent()  // Tests/
            .deletingLastPathComponent()  // packages/MeeshySDK
        let sourceURL = packageRoot
            .appendingPathComponent("Sources/MeeshySDK/Networking/ClientInfoProvider.swift")
        let src = try String(contentsOf: sourceURL, encoding: .utf8)

        guard let bodyStart = src.range(of: "func enrichWithLocation") else {
            XCTFail("enrichWithLocation introuvable dans ClientInfoProvider.swift")
            return
        }
        let body = src[bodyStart.upperBound...]

        XCTAssertFalse(body.contains("CLLocationManager()"),
                       "Un manager par requête API : CoreLocation attend une instance durable, pas une instance jetable créée à chaque appel.")
        XCTAssertTrue(src.contains("geoCacheExpiry = Date().addingTimeInterval("),
                      "Un échec (pas de localisation disponible) doit poser un TTL négatif, sinon le cycle CoreLocation + réseau repart à chaque requête API.")
    }
}
