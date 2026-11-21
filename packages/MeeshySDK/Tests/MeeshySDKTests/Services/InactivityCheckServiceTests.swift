import XCTest
@testable import MeeshySDK

/// `InactivityCheckService` (#18738) : les routes REST de la vérification d'inactivité et la réponse « Je vais bien ».
final class InactivityCheckServiceTests: XCTestCase {

    private func makeSUT() -> (service: InactivityCheckService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (InactivityCheckService(api: api), api)
    }

    private let state = #"{"userId":"u1","inactiveSince":"2026-11-18T08:00:00.000Z","alertedAt":"2026-11-18T20:30:00.000Z"}"#

    func test_snapshot_getsTheServedAlerts() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/inactivity", json: #"{"success":true,"data":{"items":[\#(state)]}}"#)

        let items = try await service.snapshot()

        XCTAssertEqual(api.lastRequest?.method, "GET")
        XCTAssertEqual(items.map(\.userId), ["u1"])
    }

    func test_settings_readsTheDelay_nullIsOff() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/me/wellness/settings", json: #"{"success":true,"data":{"delayHours":null}}"#)

        let settings = try await service.settings()

        XCTAssertEqual(settings.delay, .off)
    }

    func test_updateSettings_putsTheDelayHours_andNullToTurnOff() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/me/wellness/settings", json: #"{"success":true,"data":{"delayHours":6}}"#)

        let written = try await service.updateSettings(delay: .sixHours)

        XCTAssertEqual(api.lastRequest?.method, "PUT")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["delayHours"] as? Int, 6)
        XCTAssertEqual(written.delay, .sixHours)

        _ = try await service.updateSettings(delay: .off)
        XCTAssertEqual(api.lastRequest?.bodyJSON?.keys.sorted(), ["delayHours"])
        XCTAssertTrue(api.lastRequest?.bodyJSON?["delayHours"] is NSNull)
    }

    func test_updatePersonSettings_putsOnlyTheSharedChoice() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/u1/inactivity/settings", json: #"{"success":true,"data":{"userId":"u1","shared":false}}"#)

        let served = try await service.updatePersonSettings(userId: "u1", isShared: false)

        XCTAssertEqual(api.lastRequest?.method, "PUT")
        XCTAssertEqual(api.lastRequest?.bodyJSON?.keys.sorted(), ["shared"])
        XCTAssertFalse(served.isShared)
    }

    func test_personSettings_readsTheSharedChoice() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/u1/inactivity/settings", json: #"{"success":true,"data":{"userId":"u1","shared":true}}"#)

        let served = try await service.personSettings(userId: "u1")

        XCTAssertTrue(served.isShared)
    }

    func test_answerWellness_readsTracked_andAFailureIsFailed() async {
        let (service, api) = makeSUT()
        api.stubWire("/me/wellness/ok", json: #"{"success":true,"data":{"tracked":false}}"#)

        let ignored = await service.answerWellness()

        XCTAssertEqual(api.lastRequest?.method, "POST")
        XCTAssertEqual(ignored, .ignored)

        let (offline, offlineAPI) = makeSUT()
        offlineAPI.stubError("/me/wellness/ok", error: URLError(.notConnectedToInternet))
        let outcome = await offline.answerWellness()
        XCTAssertEqual(outcome, .failed)
    }
}
