import XCTest
import MeeshySDK
@testable import Meeshy

/// **Le magasin garde ce qui brûle, et allume ce qui vient de mourir** (#17938).
/// Pour `ExpiredEphemeralRow`, une ligne en combustion est déjà morte —
/// échéance passée, parfois destruction déjà gravée par l'annonce du serveur
/// que le moteur de synchronisation écrit avant que l'écran ne réagisse. Sans
/// ces deux gardes, toute publication pendant la combustion retirait la ligne
/// au milieu de son feu, et une annonce arrivée avant l'horloge locale la
/// retirait sans aucune combustion (mesuré au simulateur).
@MainActor
final class MessageStoreBurningTests: XCTestCase {

    private let conversationId = "conv-burn"

    private func record(_ id: String, content: String = "Hello", serverId: String? = nil) -> MessageRecord {
        var record = MessageStoreObservationHelper.makeRecord(localId: id, conversationId: conversationId, content: content)
        record.serverId = serverId
        return record
    }

    /// Une loi « vivant » de substitution : tout sauf `dead`.
    private func livingExceptDead(_ records: [MessageRecord]) -> [MessageRecord] {
        records.filter { $0.localId != "dead" }
    }

    private func keep(_ records: [MessageRecord], burning: Set<String> = [], shown: [MessageRecord] = [],
                      freshlyDead: @escaping (MessageRecord) -> Bool = { _ in false }) -> MessageStore.BurnOutcome {
        MessageStore.keepingBurning(livingExceptDead, of: records, burning: burning, shown: shown, freshlyDead: freshlyDead)
    }

    func test_nothingBurns_dropsTheDead_andIgnitesNothing() {
        let outcome = keep([record("a"), record("dead"), record("b")])
        XCTAssertEqual(outcome.kept.map(\.localId), ["a", "b"])
        XCTAssertTrue(outcome.ignite.isEmpty)
    }

    func test_theDeadBurns_staysInPlace() {
        let outcome = keep([record("a"), record("dead"), record("b")], burning: ["dead"])
        XCTAssertEqual(outcome.kept.map(\.localId), ["a", "dead", "b"], "la ligne en combustion reste, à sa place")
        XCTAssertTrue(outcome.ignite.isEmpty, "déjà allumée : rien à demander")
    }

    func test_burningMatchesTheServerIdToo() {
        let rows = [record("a"), record("cid-local", serverId: "dead-server"), record("b")]
        let living: ([MessageRecord]) -> [MessageRecord] = { $0.filter { $0.serverId != "dead-server" } }
        XCTAssertEqual(MessageStore.keepingBurning(living, of: rows, burning: [], shown: [], freshlyDead: { _ in false }).kept.map(\.localId), ["a", "b"])
        XCTAssertEqual(MessageStore.keepingBurning(living, of: rows, burning: ["dead-server"], shown: [], freshlyDead: { _ in false }).kept.map(\.localId), ["a", "cid-local", "b"])
    }

    func test_aShownRowThatJustDied_isKeptInItsShownForm_andIgnited() {
        let shownDead = record("dead", content: "Ce texte brûle")
        let reread = record("dead", content: "")   // la base porte déjà le contenu vidé
        let outcome = keep([record("a"), reread, record("b")], shown: [record("a"), shownDead, record("b")], freshlyDead: { _ in true })
        XCTAssertEqual(outcome.kept.map(\.localId), ["a", "dead", "b"])
        XCTAssertEqual(outcome.kept[1].content, "Ce texte brûle", "c'est le texte affiché qui brûle, pas la pierre tombale relue")
        XCTAssertEqual(outcome.ignite, ["dead"])
    }

    func test_aShownRowThatDiedLongAgo_isDropped() {
        let outcome = keep([record("a"), record("dead")], shown: [record("a"), record("dead")], freshlyDead: { _ in false })
        XCTAssertEqual(outcome.kept.map(\.localId), ["a"])
        XCTAssertTrue(outcome.ignite.isEmpty)
    }

    func test_aDeadRowNeverShown_isDropped_evenIfFresh() {
        let outcome = keep([record("a"), record("dead")], shown: [record("a")], freshlyDead: { _ in true })
        XCTAssertEqual(outcome.kept.map(\.localId), ["a"], "on n'assiste pas à une destruction qu'on n'a pas vue commencer")
        XCTAssertTrue(outcome.ignite.isEmpty)
    }

    func test_anUnrelatedBurningIdChangesNothing() {
        let outcome = keep([record("a"), record("dead")], burning: ["elsewhere"])
        XCTAssertEqual(outcome.kept.map(\.localId), ["a"])
    }
}
