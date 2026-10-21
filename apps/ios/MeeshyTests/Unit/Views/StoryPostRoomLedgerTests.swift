import XCTest
@testable import Meeshy

final class StoryPostRoomLedgerTests: XCTestCase {

    /// Groupe A story 3 → groupe B story 0, les deux `onChange` tirant l'un
    /// après l'autre : la salle de A3 est quittée, celle de B0 rejointe UNE fois.
    func test_groupSwitch_firingTwice_leavesTheHeldRoom_andJoinsOnce() {
        var ledger = StoryPostRoomLedger()
        XCTAssertEqual(ledger.hold("A3"), .init(leave: nil, join: "A3"))
        XCTAssertEqual(ledger.hold("B0"), .init(leave: "A3", join: "B0"))
        XCTAssertEqual(ledger.hold("B0"), .init(), "le second onChange n'ajoute rien")
    }

    func test_closingTheViewer_leavesTheHeldRoom() {
        var ledger = StoryPostRoomLedger()
        _ = ledger.hold("S1")
        XCTAssertEqual(ledger.hold(nil), .init(leave: "S1", join: nil))
        XCTAssertNil(ledger.held)
    }

    func test_joinsAndLeavesBalance_overALongSession() {
        var ledger = StoryPostRoomLedger()
        var refs: [String: Int] = [:]
        for id in ["a", "b", "b", "c", "a", "a", "d", nil] as [String?] {
            let move = ledger.hold(id)
            if let leave = move.leave { refs[leave, default: 0] -= 1 }
            if let join = move.join { refs[join, default: 0] += 1 }
        }
        XCTAssertTrue(refs.values.allSatisfy { $0 == 0 }, "aucune salle tenue après fermeture : \(refs)")
    }

    func test_storyViewer_routesEveryRoomMoveThroughTheLedger() throws {
        // La salle se tient dans `StoryViewerEngagement`, collaborateur du lecteur : il fait partie de l'unité.
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Main/Views/StoryViewerView.swift",
            alsoIncluding: ["Meeshy/Features/Main/Views/StoryViewerEngagement.swift"]))
        XCTAssertFalse(code.contains("transitionPostRoom(from:"), "plus de story « précédente » recalculée")
        let joins = code.components(separatedBy: "joinPostRoom(").count - 1
        let leaves = code.components(separatedBy: "leavePostRoom(").count - 1
        XCTAssertEqual(joins, 1, "un seul site rejoint : celui du registre")
        XCTAssertEqual(leaves, 1, "un seul site quitte : celui du registre")
    }
}
