import XCTest
@testable import MeeshySDK

/// `PhoneReachabilityService` (#18737) : les routes REST du téléphone injoignable et le signe de vie.
final class PhoneReachabilityServiceTests: XCTestCase {

    private func makeSUT() -> (service: PhoneReachabilityService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (PhoneReachabilityService(api: api), api)
    }

    private let state = #"{"userId":"u1","unreachableSince":"2026-11-15T10:00:00.000Z","cause":"network"}"#

    func test_snapshot_getsTheServedStates() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/phone-reachability", json: #"{"success":true,"data":{"items":[\#(state)]}}"#)

        let items = try await service.snapshot()

        XCTAssertEqual(api.lastRequest?.method, "GET")
        XCTAssertEqual(items.map(\.userId), ["u1"])
        XCTAssertEqual(items.first?.cause, .network)
    }

    func test_state_null_meansThePhoneAnswers() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/u1/phone-reachability", json: #"{"success":true,"data":{"state":null}}"#)

        let served = try await service.state(userId: "u1")

        XCTAssertNil(served)
    }

    func test_updatePersonSettings_putsTheSharedChoice() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/u1/phone-reachability/settings",
                     json: #"{"success":true,"data":{"userId":"u1","shared":true}}"#)

        let served = try await service.updatePersonSettings(userId: "u1", isShared: true)

        XCTAssertEqual(api.lastRequest?.method, "PUT")
        XCTAssertTrue(served.isShared)
    }

    func test_emitterSettings_readAndWrite() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/me/device/reachability/settings", json: #"{"success":true,"data":{"sharingEnabled":false}}"#)

        let read = try await service.emitterSettings()
        let written = try await service.updateEmitterSettings(sharingEnabled: false)

        XCTAssertFalse(read.sharingEnabled)
        XCTAssertFalse(written.sharingEnabled)
        XCTAssertEqual(api.lastRequest?.method, "PUT")
    }

    func test_alive_readsTracked_andAFailureIsFailed() async {
        let (service, api) = makeSUT()
        api.stubWire("/me/device/alive", json: #"{"success":true,"data":{"tracked":true}}"#)

        let tracked = await service.alive()

        XCTAssertEqual(api.lastRequest?.method, "POST")
        XCTAssertEqual(tracked, .tracked)

        let (offline, offlineAPI) = makeSUT()
        offlineAPI.stubError("/me/device/alive", error: URLError(.notConnectedToInternet))
        let outcome = await offline.alive()
        XCTAssertEqual(outcome, .failed)
    }
}
