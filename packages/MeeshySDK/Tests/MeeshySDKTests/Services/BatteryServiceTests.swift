import XCTest
@testable import MeeshySDK

/// `BatteryService` (#14147) : les routes REST de la batterie, et les refus lus par leur code.
final class BatteryServiceTests: XCTestCase {

    private func makeSUT() -> (service: BatteryService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (BatteryService(api: api), api)
    }

    private func rejection(_ statusCode: Int, code: String) -> MeeshyError {
        .rejected(APIRejection(statusCode: statusCode, code: code, message: "refus"))
    }

    private let state = #"{"userId":"u1","phase":"low","level":25,"charging":false,"lowPower":false,"measuredAt":"2026-11-15T10:00:00.000Z"}"#

    func test_snapshot_getsTheServedStates() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/battery", json: #"{"success":true,"data":{"items":[\#(state)]}}"#)

        let items = try await service.snapshot()

        XCTAssertEqual(api.lastRequest?.method, "GET")
        XCTAssertEqual(items.map(\.userId), ["u1"])
    }

    func test_state_null_meansNoEpisode() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/u1/battery", json: #"{"success":true,"data":{"state":null}}"#)

        let served = try await service.state(userId: "u1")

        XCTAssertNil(served)
    }

    func test_pull_accepted_returnsTheRequestInstant() async {
        let (service, api) = makeSUT()
        api.stubWire("/relations/u1/battery/pull",
                     json: #"{"success":true,"data":{"requestedAt":"2026-11-15T10:00:00.000Z","episodeOnly":true}}"#)

        let outcome = await service.pull(userId: "u1")

        XCTAssertEqual(api.lastRequest?.method, "POST")
        XCTAssertEqual(outcome, .requested(at: WireDate.date(from: "2026-11-15T10:00:00.000Z") ?? Date()))
    }

    func test_pull_refusals_areReadByTheirCode() async {
        let cases: [(String, Int, BatteryPullOutcome)] = [
            (BatteryErrorCode.pullTooSoon, 429, .tooSoon),
            (BatteryErrorCode.pullForbidden, 403, .forbidden),
            (BatteryErrorCode.rateLimited, 429, .rateLimited),
            ("OTHER", 500, .failed),
        ]
        for (code, status, expected) in cases {
            let (service, api) = makeSUT()
            api.stubError("/relations/u1/battery/pull", error: rejection(status, code: code))
            let outcome = await service.pull(userId: "u1")
            XCTAssertEqual(outcome, expected, code)
        }
    }

    func test_updatePersonSettings_putsOnlyWhatChanged() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/u1/battery/settings",
                     json: #"{"success":true,"data":{"userId":"u1","shared":true,"receive":"pill"}}"#)
        let update = try XCTUnwrap(BatteryPersonSettingsUpdate(receive: .pill))

        let served = try await service.updatePersonSettings(userId: "u1", update)

        XCTAssertEqual(api.lastRequest?.method, "PUT")
        XCTAssertEqual(served.receive, .pill)
    }

    func test_emitterSettings_readAndWrite() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/me/device/battery/settings", json: #"{"success":true,"data":{"sharingEnabled":false}}"#)

        let read = try await service.emitterSettings()
        let written = try await service.updateEmitterSettings(sharingEnabled: false)

        XCTAssertFalse(read.sharingEnabled)
        XCTAssertFalse(written.sharingEnabled)
        XCTAssertEqual(api.lastRequest?.method, "PUT")
    }

    func test_report_readsTracked_andMapsTheRateLimit() async {
        let (service, api) = makeSUT()
        api.stubWire("/me/device/battery", json: #"{"success":true,"data":{"tracked":false}}"#)
        let report = BatteryReport(level: 20, charging: false, lowPower: false, measuredAt: Date())

        let ignored = await service.report(report)
        XCTAssertEqual(ignored, .ignored)

        let (limited, limitedAPI) = makeSUT()
        limitedAPI.stubError("/me/device/battery", error: rejection(429, code: BatteryErrorCode.rateLimited))
        let outcome = await limited.report(report)
        XCTAssertEqual(outcome, .rateLimited)
    }

    func test_socketAck_isReadAsTheReportOutcome() {
        typealias Sender = BatterySocketReportSender
        XCTAssertEqual(Sender.outcome(.accepted(.init(tracked: true))), .tracked)
        XCTAssertEqual(Sender.outcome(.accepted(.init(tracked: false))), .ignored)
        XCTAssertEqual(Sender.outcome(.timedOut), .offline)
        XCTAssertEqual(Sender.outcome(.refused(SocketAckRefusal(response: ["code": BatteryErrorCode.rateLimited]))),
                       .rateLimited)
        XCTAssertEqual(Sender.outcome(.refused(SocketAckRefusal(response: ["code": BatteryErrorCode.invalid]))),
                       .refused)
    }
}
