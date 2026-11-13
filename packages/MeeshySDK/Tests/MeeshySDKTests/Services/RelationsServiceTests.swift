import XCTest
@testable import MeeshySDK

/// `RelationsService` (#13938) — la lecture des cercles et le rituel du Sang.
/// La passerelle fait foi (`services/gateway/src/routes/relations/`) ; le
/// service ne décide d'aucun niveau, il porte les phases et lit les refus typés.
final class RelationsServiceTests: XCTestCase {

    private func makeSUT() -> (service: RelationsService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (RelationsService(api: api), api)
    }

    private func link(_ userId: String, _ level: RelationLevel) -> RelationLink {
        RelationLink(userId: userId, effectiveLevel: level, grantedByMe: level)
    }

    private func rejection(_ statusCode: Int, code: String) -> MeeshyError {
        .rejected(APIRejection(statusCode: statusCode, code: code, message: "refus"))
    }

    // MARK: - Lecture

    func test_links_getsTheCirclesList() async throws {
        let (service, api) = makeSUT()
        api.stub("/relations", result: APIResponse<[RelationLink]>(
            success: true, data: [link("u1", .friend), link("u2", .blood)], error: nil))

        let links = try await service.links()

        XCTAssertEqual(api.lastRequest?.endpoint, "/relations")
        XCTAssertEqual(api.lastRequest?.method, "GET")
        XCTAssertEqual(links.map(\.userId), ["u1", "u2"])
    }

    func test_config_getsTheLevelTable() async throws {
        let (service, api) = makeSUT()
        let config = RelationsConfig(levels: [
            RelationLevelPresentation(level: "BLOOD", labelKey: "k", icon: "🩸", labels: ["fr": "Sang"])
        ])
        api.stub("/relations/config", result: APIResponse<RelationsConfig>(success: true, data: config, error: nil))

        let served = try await service.config()

        XCTAssertEqual(api.lastRequest?.endpoint, "/relations/config")
        XCTAssertEqual(served.label(for: .blood, language: "fr"), "Sang")
    }

    func test_link_getsTheLinkWithThisPerson() async throws {
        let (service, api) = makeSUT()
        api.stub("/relations/u1", result: APIResponse<RelationLink>(success: true, data: link("u1", .friend), error: nil))

        let served = try await service.link(userId: "u1")

        XCTAssertEqual(api.lastRequest?.endpoint, "/relations/u1")
        XCTAssertEqual(api.lastRequest?.method, "GET")
        XCTAssertEqual(served.effectiveLevel, .friend)
    }

    func test_nowPlaying_getsTheServedListenings_asTheGatewaySendsThem() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/now-playing", json: """
        {"success":true,"data":{"items":[
          {"userId":"u1","category":"music","updatedAt":"2026-11-08T10:00:00.000Z","expiresAt":"2026-11-08T10:15:00.000Z"},
          {"userId":"u2","category":"music","title":"Clair de lune","source":"Spotify",
           "updatedAt":"2026-11-08T10:00:00.000Z","expiresAt":"2026-11-08T10:15:00.000Z"}
        ]}}
        """)

        let served = try await service.nowPlaying()

        XCTAssertEqual(api.lastRequest?.endpoint, "/relations/now-playing")
        XCTAssertEqual(api.lastRequest?.method, "GET")
        XCTAssertEqual(served.map(\.userId), ["u1", "u2"])
        XCTAssertNil(served[0].title)
        XCTAssertEqual(served[1].source, "Spotify")
    }

    func test_sharedLocations_withoutBounds_coversTheWholeMap() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/locations", json: """
        {"success":true,"data":{"items":[
          {"userId":"u1","latitude":48.85,"longitude":2.35,"precision":"city","radiusMeters":8000,
           "updatedAt":"2026-11-13T10:00:00.000Z","expiresAt":"2026-11-13T11:00:00.000Z"}
        ]}}
        """)

        let served = try await service.sharedLocations(within: nil)

        XCTAssertEqual(api.lastRequest?.endpoint, "/relations/locations")
        XCTAssertEqual(api.lastRequest?.method, "GET")
        XCTAssertNil(api.lastRequest?.queryItems)
        XCTAssertEqual(served.map(\.userId), ["u1"])
        XCTAssertEqual(served.first?.precision, .city)
    }

    func test_sharedLocations_withBounds_sendsTheBboxTheGatewayReads() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/locations", json: #"{"success":true,"data":{"items":[]}}"#)
        let bounds = SharedLocationBounds(minLongitude: 2, minLatitude: 48, maxLongitude: 3, maxLatitude: 49)

        _ = try await service.sharedLocations(within: bounds)

        XCTAssertEqual(api.lastRequest?.queryItems, [URLQueryItem(name: "bbox", value: "2.0,48.0,3.0,49.0")])
    }

    // MARK: - Baisser (#14910)

    func test_lower_postsTheTargetLevelAndReadsTheServedLink() async throws {
        let (service, api) = makeSUT()
        api.stub("/relations/u1/level", result: APIResponse<RelationLink>(
            success: true, data: link("u1", .acquaintance), error: nil))

        let served = try await service.lower(userId: "u1", to: .acquaintance)

        XCTAssertEqual(api.lastRequest?.endpoint, "/relations/u1/level")
        XCTAssertEqual(api.lastRequest?.method, "POST")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["level"] as? String, "ACQUAINTANCE")
        XCTAssertEqual(served.effectiveLevel, .acquaintance)
    }

    func test_unlink_postsPublic() async throws {
        let (service, api) = makeSUT()
        api.stub("/relations/u1/level", result: APIResponse<RelationLink>(
            success: true, data: link("u1", .public), error: nil))

        _ = try await service.lower(userId: "u1", to: .public)

        XCTAssertEqual(api.lastRequest?.bodyJSON?["level"] as? String, "PUBLIC")
    }

    // MARK: - Rituel

    func test_ritualStart_postsThePhaseWithoutTokenNorConsents() async throws {
        let (service, api) = makeSUT()
        api.stub("/relations/u1/ritual", result: APIResponse<RelationRitualStep>(
            success: true,
            data: RelationRitualStep(token: "tok", requestId: "r1", expiresAt: "2026-11-01T10:01:00.000Z", holdWindowMs: 15_000),
            error: nil))

        let step = try await service.ritual(userId: "u1", phase: .start, token: nil, consents: nil)

        XCTAssertEqual(api.lastRequest?.method, "POST")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["phase"] as? String, "start")
        XCTAssertNil(api.lastRequest?.bodyJSON?["token"])
        XCTAssertNil(api.lastRequest?.bodyJSON?["consents"])
        XCTAssertEqual(step.token, "tok")
        XCTAssertEqual(step.holdWindowMs, 15_000)
    }

    func test_ritualConfirm_carriesTheTokenAndTheFourExplicitConsents() async throws {
        let (service, api) = makeSUT()
        api.stub("/relations/u1/ritual", result: APIResponse<RelationRitualStep>(
            success: true, data: RelationRitualStep(completed: true, level: "BLOOD"), error: nil))
        let consents = RelationRitualConsents(listeningTitle: true, locationLive: false, locationHistory: false, locationProximity: true)

        let step = try await service.ritual(userId: "u1", phase: .confirm, token: "tok", consents: consents)

        XCTAssertEqual(api.lastRequest?.bodyJSON?["phase"] as? String, "confirm")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["token"] as? String, "tok")
        let sent = api.lastRequest?.bodyJSON?["consents"] as? [String: Bool]
        XCTAssertEqual(sent, ["listeningTitle": true, "locationLive": false, "locationHistory": false, "locationProximity": true])
        XCTAssertEqual(step.completed, true)
    }

    func test_ritualConsents_areAllRefusedByDefault() {
        XCTAssertEqual(
            RelationRitualConsents.allRefused,
            RelationRitualConsents(listeningTitle: false, locationLive: false, locationHistory: false, locationProximity: false)
        )
    }

    // MARK: - Refus typés

    func test_refusal_readsTheMachineCodeOfAStructuredRejection() {
        XCTAssertEqual(RelationRefusal.from(rejection(409, code: "RELATION_RITUAL_LAPSED")), .ritualLapsed)
        XCTAssertEqual(RelationRefusal.from(rejection(409, code: "RELATION_RITUAL_NOT_SYNCHRONISED")), .ritualNotSynchronised)
        XCTAssertEqual(RelationRefusal.from(rejection(409, code: "RELATION_RITUAL_NO_REQUEST")), .ritualNoRequest)
        XCTAssertEqual(RelationRefusal.from(rejection(409, code: "RELATION_RITUAL_INVALID")), .ritualInvalid)
        XCTAssertEqual(RelationRefusal.from(rejection(409, code: "RELATION_RITUAL_BUSY")), .ritualBusy)
        XCTAssertEqual(RelationRefusal.from(rejection(400, code: "RELATION_CONSENT_REQUIRED")), .consentRequired)
        XCTAssertEqual(RelationRefusal.from(rejection(409, code: "RELATION_PHASE_SKIP")), .phaseSkip)
        XCTAssertEqual(RelationRefusal.from(rejection(409, code: "RELATION_NOT_ELIGIBLE")), .notEligible)
        XCTAssertEqual(RelationRefusal.from(rejection(409, code: "RELATION_COOLDOWN")), .cooldown)
    }

    func test_refusal_isNilForAnythingElse() {
        XCTAssertNil(RelationRefusal.from(rejection(409, code: "SOMETHING_ELSE")))
        XCTAssertNil(RelationRefusal.from(MeeshyError.server(statusCode: 500, message: "boom")))
        XCTAssertNil(RelationRefusal.from(URLError(.notConnectedToInternet)))
    }

    func test_theRitualAndTheLevelAddressesAreStructured_theReadsStayOpaque() {
        XCTAssertEqual(RelationsEndpoint.byUserIdRitual(userId: "u1").rejectionPolicy, .structured)
        XCTAssertEqual(RelationsEndpoint.byUserIdLevel(userId: "u1").rejectionPolicy, .structured)
        XCTAssertEqual(RelationsEndpoint.root.rejectionPolicy, .opaque)
        XCTAssertEqual(RelationsEndpoint.config.rejectionPolicy, .opaque)
    }
}
