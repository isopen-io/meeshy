import Combine
import XCTest
@testable import MeeshySDK

private final class RelationRegistrar: SocketEventRegistering {
    private var receivers: [String: ([Any]) -> Void] = [:]

    func listen(_ event: String, _ receive: @escaping ([Any]) -> Void) {
        receivers[event] = receive
    }

    func deliver(_ event: String, _ payload: [String: Any]) {
        receivers[event]?([payload])
    }
}

/// Les quatre événements du lien (#13933, #13938) : `relation:level-raised`,
/// `relation:ritual-started|progress|completed`, tous serveur -> client sur la
/// room `user:<id>`. Aucun événement de baisse n'existe (RG-07) : le client n'en
/// écoute donc aucun.
final class RelationSocketEventsTests: XCTestCase {

    private func installed() -> RelationRegistrar {
        let registrar = RelationRegistrar()
        registrar.install(MessageSocketRoutes.all(for: .shared))
        return registrar
    }

    private func firstValue<P: Publisher>(
        of publisher: P,
        where matches: @escaping (P.Output) -> Bool,
        after trigger: () -> Void
    ) async -> Bool where P.Failure == Never {
        let published = expectation(description: "publication")
        let subscription = publisher.sink { if matches($0) { published.fulfill() } }
        trigger()
        await fulfillment(of: [published], timeout: 2)
        subscription.cancel()
        return true
    }

    func test_theWireNamesAreTheServerOnes() {
        XCTAssertEqual(SocketEvent.relationLevelRaised.rawValue, "relation:level-raised")
        XCTAssertEqual(SocketEvent.relationRitualStarted.rawValue, "relation:ritual-started")
        XCTAssertEqual(SocketEvent.relationRitualProgress.rawValue, "relation:ritual-progress")
        XCTAssertEqual(SocketEvent.relationRitualCompleted.rawValue, "relation:ritual-completed")
    }

    func test_levelRaisedIsDeliveredDecoded() async {
        let registrar = installed()
        let user = "raised-\(UUID().uuidString)"
        _ = await firstValue(of: RelationEvents.levelRaised, where: { $0.userId == user && $0.level == .close }) {
            registrar.deliver("relation:level-raised", ["userId": user, "level": "CLOSE", "at": "2026-11-01T10:00:00.000Z"])
        }
    }

    func test_ritualStartedIsDeliveredWithItsHoldWindow() async {
        let registrar = installed()
        let token = "tok-\(UUID().uuidString)"
        _ = await firstValue(of: RelationEvents.ritualStarted, where: { $0.token == token && $0.holdWindowMs == 15_000 && $0.userId == "u9" }) {
            registrar.deliver("relation:ritual-started", [
                "token": token, "userId": "u9", "requestId": "r1",
                "expiresAt": "2026-11-01T10:01:00.000Z", "holdWindowMs": 15_000,
            ])
        }
    }

    func test_ritualProgressIsDeliveredWithItsStage() async {
        let registrar = installed()
        let token = "tok-\(UUID().uuidString)"
        _ = await firstValue(of: RelationEvents.ritualProgress, where: { $0.token == token && $0.stage == .held }) {
            registrar.deliver("relation:ritual-progress", ["token": token, "userId": "u9", "stage": "held"])
        }
    }

    func test_anUnknownStageIsKeptAsNilNotACrash() async {
        let registrar = installed()
        let token = "tok-\(UUID().uuidString)"
        _ = await firstValue(of: RelationEvents.ritualProgress, where: { $0.token == token && $0.stage == nil }) {
            registrar.deliver("relation:ritual-progress", ["token": token, "userId": "u9", "stage": "teleported"])
        }
    }

    func test_ritualCompletedIsDeliveredWithTheSealedLevel() async {
        let registrar = installed()
        let token = "tok-\(UUID().uuidString)"
        _ = await firstValue(of: RelationEvents.ritualCompleted, where: { $0.token == token && $0.level == .blood }) {
            registrar.deliver("relation:ritual-completed", [
                "token": token, "userId": "u9", "level": "BLOOD", "at": "2026-11-01T10:00:30.000Z",
            ])
        }
    }
}
