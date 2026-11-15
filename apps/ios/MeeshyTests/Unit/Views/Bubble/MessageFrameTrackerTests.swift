import XCTest
@testable import Meeshy

@MainActor
final class MessageFrameTrackerTests: XCTestCase {

    private func makeTracker(maxEntries: Int = 200) -> MessageFrameTracker {
        MessageFrameTracker(maxEntries: maxEntries)
    }

    private func makeFrame(_ y: CGFloat) -> CGRect {
        CGRect(x: 0, y: y, width: 100, height: 50)
    }

    // MARK: - Basic update / lookup

    func test_update_merges_doesNotErase() {
        var tracker = makeTracker()
        tracker.update(["a": makeFrame(10)])
        tracker.update(["b": makeFrame(20)])

        XCTAssertEqual(tracker.frame(for: "a"), makeFrame(10))
        XCTAssertEqual(tracker.frame(for: "b"), makeFrame(20))
    }

    func test_frame_returnsCachedFrame() {
        var tracker = makeTracker()
        tracker.update(["msg1": makeFrame(100)])

        XCTAssertEqual(tracker.frame(for: "msg1"), makeFrame(100))
    }

    func test_frame_unknownId_returnsNil() {
        let tracker = makeTracker()
        XCTAssertNil(tracker.frame(for: "ghost"))
    }

    func test_update_doesNotResetExistingFrames() {
        var tracker = makeTracker()
        tracker.update(["a": makeFrame(10), "b": makeFrame(20)])
        tracker.update(["c": makeFrame(30)])

        XCTAssertEqual(tracker.frame(for: "a"), makeFrame(10),
                       "Existing entry must survive a partial update")
        XCTAssertEqual(tracker.frame(for: "b"), makeFrame(20))
        XCTAssertEqual(tracker.frame(for: "c"), makeFrame(30))
    }

    // MARK: - LRU eviction

    func test_update_evictsLRU_when200entriesExceeded() {
        var tracker = makeTracker(maxEntries: 3)
        tracker.update(["a": makeFrame(1)])
        tracker.update(["b": makeFrame(2)])
        tracker.update(["c": makeFrame(3)])
        tracker.update(["d": makeFrame(4)])

        XCTAssertNil(tracker.frame(for: "a"), "Oldest entry evicted")
        XCTAssertEqual(tracker.frame(for: "b"), makeFrame(2))
        XCTAssertEqual(tracker.frame(for: "c"), makeFrame(3))
        XCTAssertEqual(tracker.frame(for: "d"), makeFrame(4))
    }

    func test_update_mruReorderOnRepeatedAccess() {
        var tracker = makeTracker(maxEntries: 3)
        tracker.update(["a": makeFrame(1)])
        tracker.update(["b": makeFrame(2)])
        tracker.update(["c": makeFrame(3)])
        // Touch "a" → moves to MRU end. "b" is now LRU.
        tracker.update(["a": makeFrame(11)])
        // Adding "d" should evict "b", not "a".
        tracker.update(["d": makeFrame(4)])

        XCTAssertEqual(tracker.frame(for: "a"), makeFrame(11), "a moved to MRU end + value updated")
        XCTAssertNil(tracker.frame(for: "b"), "b evicted as LRU")
        XCTAssertEqual(tracker.frame(for: "c"), makeFrame(3))
        XCTAssertEqual(tracker.frame(for: "d"), makeFrame(4))
    }

    // MARK: - Removal

    func test_removeFrame_clearsBothDictAndAccessOrder() {
        var tracker = makeTracker()
        tracker.update(["a": makeFrame(1), "b": makeFrame(2)])
        tracker.removeFrame(for: "a")

        XCTAssertNil(tracker.frame(for: "a"))
        XCTAssertEqual(tracker.frame(for: "b"), makeFrame(2))
        XCTAssertFalse(tracker.accessOrder.contains("a"),
                       "LRU queue stays consistent after explicit removal")
    }

    // MARK: - #3946 — la boîte qui empêche la mesure de réveiller la racine

    /// La boîte ne réécrit pas la loi : elle la PORTE. Si elle la
    /// réimplémentait, le plafond LRU aurait deux versions, et la seconde ne
    /// serait testée par personne.
    func test_theBox_carriesTheLRULaw_ratherThanReimplementingIt() {
        let box = MessageFrameBox(maxEntries: 2)
        box.update(["a": makeFrame(1)])
        box.update(["b": makeFrame(2)])
        box.update(["c": makeFrame(3)])

        XCTAssertNil(box.frame(for: "a"), "le plus ancien sort au-delà du plafond — la loi de la valeur")
        XCTAssertEqual(box.frame(for: "b"), makeFrame(2))
        XCTAssertEqual(box.frame(for: "c"), makeFrame(3))
    }

    func test_theBox_forgetsAFrameOnDemand() {
        let box = MessageFrameBox()
        box.update(["a": makeFrame(1)])
        box.removeFrame(for: "a")
        XCTAssertNil(box.frame(for: "a"))
    }

    /// **Une RÉFÉRENCE, jamais une valeur.** Une valeur tenue en `@State`
    /// invalide le body de son propriétaire à chaque mutation — et le
    /// propriétaire est la racine du fil. En Rivière, chaque bulle publie sa
    /// frame : la préférence remontait jusqu'ici, invalidait `ConversationView`,
    /// qui reconstruisait le pane, qui relayoutait, qui republiait. La boucle
    /// ne se refermait jamais (mesures #3940 : Rivière à +5,9 points de CPU sur
    /// Bulles, conversation INACTIVE).
    ///
    /// Le NOM de la propriété est délibérément inchangé :
    /// `ConversationLongPressMenuGuardTests` interdit nommément à
    /// `presentLongPressMenu` de lire `frameTracker`, et une garde négative qui
    /// cherche un nom disparu passe au vert en perdant sa protection.
    func test_conversationViewHoldsABox_soMeasuringNeverInvalidatesTheRoot() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Bubble
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationView.swift")
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))

        XCTAssertTrue(
            Self.holdsAFrameBox(source),
            "`ConversationView` tient à nouveau la carte des frames par VALEUR : chaque mesure de "
            + "bulle réévalue le body de la racine du fil, et la Rivière reboucle sur elle-même."
        )
    }

    /// Contre-épreuve — la garde ci-dessus doit savoir dire NON, sinon elle est
    /// née verte et ne protège rien.
    func test_theGuardAbove_wouldCatchTheValueComingBack() {
        XCTAssertTrue(Self.holdsAFrameBox("@State var frameTracker = MessageFrameBox()"))
        XCTAssertFalse(
            Self.holdsAFrameBox("@State var frameTracker = MessageFrameTracker()"),
            "le retour à la valeur doit faire rougir : c'est exactement le code d'avant le correctif"
        )
    }

    private static func holdsAFrameBox(_ source: String) -> Bool {
        source.contains("@State var frameTracker = MessageFrameBox()")
            && !source.contains("@State var frameTracker = MessageFrameTracker()")
    }

}
