import XCTest
@testable import MeeshySDK

/// `PhoneCallService` (#18753) : le rapport d'un booléen, l'instantané servi à moi et les deux réglages.
final class PhoneCallServiceTests: XCTestCase {

    private func makeSUT() -> (service: PhoneCallService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (PhoneCallService(api: api), api)
    }

    private let state = #"{"userId":"u1","since":"2026-11-19T14:00:00.000Z","expiresAt":"2026-11-19T17:00:00.000Z"}"#

    func test_snapshot_getsTheServedStates() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/phone-calls", json: #"{"success":true,"data":{"items":[\#(state)]}}"#)

        let items = try await service.snapshot()

        XCTAssertEqual(api.lastRequest?.method, "GET")
        XCTAssertEqual(items.map(\.userId), ["u1"])
    }

    func test_report_postsOneBoolean_andReadsTracked() async {
        let (service, api) = makeSUT()
        api.stubWire("/me/device/call", json: #"{"success":true,"data":{"tracked":true}}"#)

        let outcome = await service.report(active: true)

        XCTAssertEqual(api.lastRequest?.method, "POST")
        XCTAssertEqual(api.lastRequest?.bodyJSON?.keys.sorted(), ["active"])
        XCTAssertEqual(api.lastRequest?.bodyJSON?["active"] as? Bool, true)
        XCTAssertEqual(outcome, .tracked)
    }

    func test_report_untrackedDeviceIsIgnored_andAFailureIsFailed() async {
        let (service, api) = makeSUT()
        api.stubWire("/me/device/call", json: #"{"success":true,"data":{"tracked":false}}"#)
        let ignored = await service.report(active: false)
        XCTAssertEqual(ignored, .ignored)

        let (offline, offlineAPI) = makeSUT()
        offlineAPI.stubError("/me/device/call", error: URLError(.notConnectedToInternet))
        let failed = await offline.report(active: true)
        XCTAssertEqual(failed, .failed)
    }

    func test_emitterSettings_readAndPutSharingEnabledOnly() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/me/device/call/settings", json: #"{"success":true,"data":{"sharingEnabled":false}}"#)

        let read = try await service.emitterSettings()
        XCTAssertFalse(read.sharingEnabled)

        _ = try await service.updateEmitterSettings(sharingEnabled: false)
        XCTAssertEqual(api.lastRequest?.method, "PUT")
        XCTAssertEqual(api.lastRequest?.bodyJSON?.keys.sorted(), ["sharingEnabled"])
    }

    func test_personSettings_readAndPutOnlyTheSharedChoice() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/u1/phone-call/settings", json: #"{"success":true,"data":{"userId":"u1","shared":true}}"#)

        let read = try await service.personSettings(userId: "u1")
        XCTAssertTrue(read.isShared)

        _ = try await service.updatePersonSettings(userId: "u1", isShared: false)
        XCTAssertEqual(api.lastRequest?.method, "PUT")
        XCTAssertEqual(api.lastRequest?.bodyJSON?.keys.sorted(), ["shared"])
    }
}
