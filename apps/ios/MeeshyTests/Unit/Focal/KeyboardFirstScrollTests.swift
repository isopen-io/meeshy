import XCTest
@testable import Meeshy

/// Le clavier part D'ABORD (#8000, directive porteur 2026-09-26) — et le
/// bouton « retour en bas » ne se replie pas avec le reste (#8002).
/// Miroir mot pour mot de `apps/web/src/lib/view/keyboard-first.test.ts`.
final class KeyboardFirstScrollTests: XCTestCase {

    func test_dismissesKeyboard_keyboardOpenTowardOlder_dismisses() {
        XCTAssertTrue(KeyboardFirstScroll.dismissesKeyboard(keyboardOpen: true, towardOlder: true))
    }

    func test_dismissesKeyboard_keyboardOpenTowardNewer_keeps() {
        XCTAssertFalse(KeyboardFirstScroll.dismissesKeyboard(keyboardOpen: true, towardOlder: false))
    }

    func test_dismissesKeyboard_keyboardClosed_nothingToDismiss() {
        XCTAssertFalse(KeyboardFirstScroll.dismissesKeyboard(keyboardOpen: false, towardOlder: true))
    }

    func test_chromeMayCollapse_gestureStartedWithKeyboard_neverCollapses() {
        XCTAssertFalse(KeyboardFirstScroll.chromeMayCollapse(keyboardOpenAtGestureStart: true, keyboardOpen: true))
        XCTAssertFalse(KeyboardFirstScroll.chromeMayCollapse(keyboardOpenAtGestureStart: true, keyboardOpen: false),
                       "le premier défilement ne fait que fermer le clavier, même une fois le clavier parti")
    }

    func test_chromeMayCollapse_keyboardOpenedMidGesture_holds() {
        XCTAssertFalse(KeyboardFirstScroll.chromeMayCollapse(keyboardOpenAtGestureStart: false, keyboardOpen: true))
    }

    func test_chromeMayCollapse_keyboardClosedThroughout_collapses() {
        XCTAssertTrue(KeyboardFirstScroll.chromeMayCollapse(keyboardOpenAtGestureStart: false, keyboardOpen: false))
    }

    // MARK: - La porte du fil (état + notifications système)

    @MainActor
    private func makeGate() -> (KeyboardFirstScrollGate, NotificationCenter, () -> Int) {
        let center = NotificationCenter()
        var dismissals = 0
        let gate = KeyboardFirstScrollGate(notificationCenter: center, dismissKeyboard: { dismissals += 1 })
        return (gate, center, { dismissals })
    }

    @MainActor
    func test_gate_keyboardUp_dragTowardOlder_dismissesOnce_andCollapsesNothing() {
        let (gate, center, dismissals) = makeGate()
        center.post(name: UIResponder.keyboardWillShowNotification, object: nil)
        gate.gestureBegan(offsetY: 100)
        gate.noteScroll(offsetY: 120, isTracking: true)
        gate.noteScroll(offsetY: 160, isTracking: true)
        XCTAssertEqual(dismissals(), 1, "le clavier se ferme une fois, pas à chaque image")
        XCTAssertFalse(gate.chromeMayCollapse, "ce premier geste ne replie rien d'autre")

        center.post(name: UIResponder.keyboardWillHideNotification, object: nil)
        gate.gestureBegan(offsetY: 160)
        XCTAssertTrue(gate.chromeMayCollapse, "le geste suivant, clavier fermé, replie comme avant")
    }

    @MainActor
    func test_gate_keyboardUp_dragTowardNewer_keepsTheKeyboardAndTheChrome() {
        let (gate, center, dismissals) = makeGate()
        center.post(name: UIResponder.keyboardWillShowNotification, object: nil)
        gate.gestureBegan(offsetY: 100)
        gate.noteScroll(offsetY: 60, isTracking: true)
        XCTAssertEqual(dismissals(), 0)
        XCTAssertFalse(gate.chromeMayCollapse)
    }

    @MainActor
    func test_gate_momentumWithoutTheFinger_neverDismisses() {
        let (gate, center, dismissals) = makeGate()
        center.post(name: UIResponder.keyboardWillShowNotification, object: nil)
        gate.gestureBegan(offsetY: 100)
        gate.noteScroll(offsetY: 400, isTracking: false)
        XCTAssertEqual(dismissals(), 0, "seul le doigt ferme le clavier")
    }

    @MainActor
    func test_gate_keyboardDown_collapsesAsBefore_withoutDismissing() {
        let (gate, _, dismissals) = makeGate()
        gate.gestureBegan(offsetY: 100)
        gate.noteScroll(offsetY: 200, isTracking: true)
        XCTAssertEqual(dismissals(), 0)
        XCTAssertTrue(gate.chromeMayCollapse)
    }

    // MARK: - Structure

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }

    private func normalized(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
    }

    func test_host_gatesTheChromeAndDismissesTheKeyboard_throughTheGate() throws {
        let code = try normalized("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(code.contains("keyboardFirst.gestureBegan(offsetY: scrollView.contentOffset.y)"),
                      "l'état du clavier est retenu au DÉBUT du geste")
        XCTAssertTrue(code.contains("keyboardFirst.noteScroll(offsetY: offset, isTracking: scrollView.isTracking)"),
                      "chaque image sous le doigt peut fermer le clavier")
        XCTAssertTrue(code.contains("} ) && keyboardFirst.chromeMayCollapse)"),
                      "le repli du chrome passe par la règle « clavier d'abord »")
        XCTAssertTrue(code.contains("collectionView.keyboardDismissMode = .interactive"),
                      "le mécanisme système progressif reste en place")
    }

    func test_scrollToBottomButton_doesNotFollowTheScrollCollapse() throws {
        let code = try normalized("Meeshy/Features/Main/Views/ConversationView.swift")
        XCTAssertEqual(code.components(separatedBy: ".hiddenTowardsEdge(hidesComposerChromeForScroll, .bottom)").count - 1, 1,
                       "seul le composeur glisse vers le bas ; la bulle « retour en bas » reste (#8002)")
    }
}
