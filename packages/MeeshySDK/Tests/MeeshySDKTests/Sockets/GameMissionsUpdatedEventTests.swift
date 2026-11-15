import XCTest
@testable import MeeshySDK

private final class MissionsRegistrar: SocketEventRegistering {
    private var receivers: [String: ([Any]) -> Void] = [:]

    func listen(_ event: String, _ receive: @escaping ([Any]) -> Void) {
        receivers[event] = receive
    }

    func deliver(_ event: String, _ payload: [String: Any]) {
        receivers[event]?([payload])
    }
}

/// `game:missions-updated` (#16425) — `{ dayKey }` sur la room personnelle quand une mission avance. L'événement ne porte
/// pas l'état : il dit « relis tes défis ». Un `dayKey` absent ou illisible ne fait donc pas tomber l'événement.
final class GameMissionsUpdatedEventTests: XCTestCase {

    private func decode(_ json: String) throws -> GameMissionsUpdatedEvent {
        try JSONDecoder().decode(GameMissionsUpdatedEvent.self, from: Data(json.utf8))
    }

    func test_decode_readsTheDayKey() throws {
        XCTAssertEqual(try decode(#"{"dayKey":"2026-11-06"}"#).dayKey, "2026-11-06")
    }

    func test_decode_withoutDayKey_stillDeliversTheEvent() throws {
        XCTAssertNil(try decode("{}").dayKey)
    }

    func test_decode_anUnreadableDayKey_isReadAsNil() throws {
        XCTAssertNil(try decode(#"{"dayKey":20261106}"#).dayKey)
    }

    func test_decode_ignoresFieldsItDoesNotKnow() throws {
        XCTAssertEqual(try decode(#"{"dayKey":"2026-11-06","missionId":"m1","done":2}"#).dayKey, "2026-11-06")
    }

    func test_wireName_isTheGatewayName() {
        XCTAssertEqual(SocketEvent.gameMissionsUpdated.rawValue, "game:missions-updated")
    }

    func test_route_postsTheDecodedEventOnItsNotification() {
        let registrar = MissionsRegistrar()
        registrar.install(MessageSocketRoutes.all(for: .shared))
        let day = "2026-11-\(Int.random(in: 10...28))"
        let posted = expectation(forNotification: .gameMissionsUpdated, object: nil) { note in
            (note.object as? GameMissionsUpdatedEvent)?.dayKey == day
        }

        registrar.deliver("game:missions-updated", ["dayKey": day])

        wait(for: [posted], timeout: 2)
    }
}
