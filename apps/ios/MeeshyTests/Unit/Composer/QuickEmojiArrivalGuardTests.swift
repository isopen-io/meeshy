import XCTest
@testable import Meeshy

/// **Un double appui sur « Envoyer » n'envoie jamais un emoji** (#7985).
///
/// Mesuré au simulateur le 2026-09-26 : le bouton d'envoi part 0,2 s après le
/// premier appui, les emojis rapides reviennent dans le même emplacement, et le
/// second appui (0,3 s après le premier) tombait sur 👍 — un message que
/// personne n'avait voulu. La rangée qui ARRIVE ignore les appuis pendant sa
/// fenêtre de garde ; une rangée déjà là n'en a aucune.
final class QuickEmojiArrivalGuardTests: XCTestCase {

    private let arrival = Date(timeIntervalSinceReferenceDate: 1_000)

    func test_acceptsTap_secondTapOfADoubleTapOnSend_isRejected() {
        XCTAssertFalse(QuickEmojiArrivalGuard.acceptsTap(arrivedAt: arrival, now: arrival.addingTimeInterval(0.1)))
    }

    func test_acceptsTap_justBeforeTheWindowCloses_isRejected() {
        XCTAssertFalse(QuickEmojiArrivalGuard.acceptsTap(arrivedAt: arrival, now: arrival.addingTimeInterval(0.49)))
    }

    func test_acceptsTap_onceTheWindowHasPassed_isAccepted() {
        XCTAssertTrue(QuickEmojiArrivalGuard.acceptsTap(arrivedAt: arrival, now: arrival.addingTimeInterval(0.5)))
    }

    func test_acceptsTap_rowWithoutKnownArrival_isAccepted() {
        XCTAssertTrue(QuickEmojiArrivalGuard.acceptsTap(arrivedAt: nil, now: arrival))
    }

    func test_acceptsTap_seriesOfTapsOnAnAlreadyPresentRow_areAllAccepted() {
        let taps = [0.6, 0.9, 1.2].map { arrival.addingTimeInterval($0) }
        XCTAssertEqual(taps.map { QuickEmojiArrivalGuard.acceptsTap(arrivedAt: arrival, now: $0) }, [true, true, true])
    }

    func test_quickEmojiButton_routesItsTapThroughTheArrivalGuard() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/UniversalComposerBar+Send.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(source.contains("QuickEmojiArrivalGuard.acceptsTap(arrivedAt: quickEmojiArrivedAt"),
                      "le tap d'un emoji rapide doit passer par la garde d'arrivée")
        XCTAssertTrue(source.contains("quickEmojiArrivedAt = Date()"),
                      "l'arrivée de la rangée doit être datée")
    }
}
