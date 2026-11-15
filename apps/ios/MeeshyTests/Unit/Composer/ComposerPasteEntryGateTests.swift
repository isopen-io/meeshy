import XCTest
import UniformTypeIdentifiers
@testable import Meeshy

/// **« Coller » ne paraît que si le presse-papier porte quelque chose à coller**
/// (#13839, recette du 2026-10-31). Le `PasteButton` système se GRISE quand le
/// presse-papier n'a rien d'acceptable, mais il reste peint : au repos, une
/// pastille « Coller » éteinte se posait sur la scène, sous la colonne, et
/// couvrait le texte de l'auteur — un contrôle sans effet, que la loi 4 retire.
@MainActor
final class ComposerPasteEntryGateTests: XCTestCase {

    private final class MockPasteboardProbe: ComposerPasteboardProbing {
        var answer: Bool
        private(set) var askedTypes: [[UTType]] = []
        init(answer: Bool) { self.answer = answer }
        func containsAcceptableContent(_ types: [UTType]) -> Bool {
            askedTypes.append(types)
            return answer
        }
    }

    private func makeGate(answer: Bool, center: NotificationCenter = NotificationCenter())
        -> (ComposerPasteEntryGate, MockPasteboardProbe, NotificationCenter) {
        let probe = MockPasteboardProbe(answer: answer)
        let gate = ComposerPasteEntryGate(probe: probe, types: [.image, .plainText], center: center)
        return (gate, probe, center)
    }

    func test_init_emptyPasteboard_hidesTheEntry() {
        let (gate, _, _) = makeGate(answer: false)
        XCTAssertFalse(gate.isShown)
    }

    func test_init_acceptableContent_showsTheEntry() {
        let (gate, probe, _) = makeGate(answer: true)
        XCTAssertTrue(gate.isShown)
        XCTAssertEqual(probe.askedTypes.last, [.image, .plainText], "la sonde reçoit les types que le collage accepte")
    }

    func test_pasteboardChanged_contentArrives_showsTheEntry() {
        let (gate, probe, center) = makeGate(answer: false)
        probe.answer = true
        center.post(name: UIPasteboard.changedNotification, object: nil)
        XCTAssertTrue(gate.isShown)
    }

    func test_appBecomesActive_contentGone_hidesTheEntry() {
        let (gate, probe, center) = makeGate(answer: true)
        probe.answer = false
        center.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        XCTAssertFalse(gate.isShown)
    }
}
