import XCTest
@testable import MeeshySDK

/// `BloodLocationService` (#18872) — la position du Sang, derrière le drapeau `services.bloodLocation`. La passerelle
/// fait foi (`services/gateway/src/routes/me/blood-location.ts`, `routes/relations/bloodLocation.ts`).
final class BloodLocationServiceTests: XCTestCase {

    private func makeSUT() -> (service: BloodLocationService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (BloodLocationService(api: api), api)
    }

    func test_history_readsTheServedPointsOldestFirst_andSkipsUnreadableOnes() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/0123456789abcdef01234567/location/history", json: """
        {"success":true,"data":{"items":[
          {"latitude":38.71,"longitude":-9.13,"recordedAt":"2026-11-16T12:30:00.000Z"},
          {"latitude":95,"longitude":-9.13,"recordedAt":"2026-11-16T12:40:00.000Z"},
          {"latitude":38.70,"longitude":-9.14,"accuracy":12,"recordedAt":"2026-11-16T09:10:00.000Z"}
        ]}}
        """)

        let history = try await service.history(of: "0123456789abcdef01234567", since: nil, limit: nil)

        XCTAssertEqual(history.points.count, 2)
        XCTAssertEqual(history.points.first?.accuracy, 12)
        XCTAssertEqual(history.points.last?.latitude, 38.71)
        XCTAssertNil(api.lastRequest?.queryItems)
    }

    func test_history_boundsTheWindowItAsksFor() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/u1/location/history", json: #"{"success":true,"data":{"items":[]}}"#)
        let since = Date(timeIntervalSince1970: 1_763_251_200)

        _ = try await service.history(of: "u1", since: since, limit: 9_000)

        XCTAssertEqual(api.lastRequest?.queryItems, [
            URLQueryItem(name: "since", value: WireDate.string(from: since)),
            URLQueryItem(name: "limit", value: "500"),
        ])
    }

    func test_history_ghostIsAnEmptyAnswer_notAnError() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/u1/location/history", json: #"{"success":true,"data":{"items":[]}}"#)

        let history = try await service.history(of: "u1", since: nil, limit: nil)

        XCTAssertTrue(history.points.isEmpty)
    }

    func test_consultations_readsWhoReadMyHistory_andWhoReadsTooOften() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/me/location/consultations", json: """
        {"success":true,"data":{"items":[
          {"observerId":"o1","consultedAt":"2026-11-16T08:00:00.000Z"},
          {"observerId":"","consultedAt":"2026-11-16T08:05:00.000Z"},
          {"observerId":"o2","consultedAt":"2026-11-16T09:00:00.000Z"},
          {"observerId":"o1","consultedAt":"2026-11-16T10:00:00.000Z"}
        ],"excessive":false,"excessiveObserverIds":["o1"]}}
        """)

        let journal = try await service.consultations()

        XCTAssertEqual(journal.items.map(\.observerId), ["o1", "o2", "o1"])
        XCTAssertTrue(journal.excessive)
        XCTAssertEqual(journal.countsByObserver.map { $0.observerId }, ["o1", "o2"])
        XCTAssertEqual(journal.countsByObserver.map { $0.count }, [2, 1])
    }

    func test_update_putsOnlyTheKeysItCarries_andReadsTheVerdict() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/me/location/blood-settings", json: #"{"success":true,"data":{"ok":false}}"#)
        let change = try XCTUnwrap(BloodLocationSettingsChange(ghost: true))

        let accepted = try await service.update(change)

        XCTAssertFalse(accepted)
        XCTAssertEqual(api.lastRequest?.method, "PUT")
        XCTAssertEqual(api.lastRequest?.bodyJSON?.keys.sorted(), ["ghost"])
        XCTAssertEqual(api.lastRequest?.bodyJSON?["ghost"] as? Bool, true)
    }

    func test_eraseHistory_deletesMyHistory() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/me/location/history", json: #"{"success":true,"data":{"erased":42}}"#)

        try await service.eraseHistory()

        XCTAssertEqual(api.lastRequest?.method, "DELETE")
        XCTAssertEqual(api.lastRequest?.endpoint, "/me/location/history")
    }

    func test_config_bloodLocationIsOpenOnlyWhenTheServerSaysSo() throws {
        func decode(_ json: String) throws -> RelationsConfig {
            try JSONDecoder().decode(RelationsConfig.self, from: Data(json.utf8))
        }
        XCTAssertTrue(try decode(#"{"levels":[],"services":{"bring":true,"bloodLocation":true}}"#).bloodLocationEnabled)
        XCTAssertFalse(try decode(#"{"levels":[],"services":{"bring":true,"bloodLocation":false}}"#).bloodLocationEnabled)
        XCTAssertFalse(try decode(#"{"levels":[],"services":{"bloodLocation":"yes"}}"#).bloodLocationEnabled)
        XCTAssertFalse(try decode(#"{"levels":[]}"#).bloodLocationEnabled)
    }
}
