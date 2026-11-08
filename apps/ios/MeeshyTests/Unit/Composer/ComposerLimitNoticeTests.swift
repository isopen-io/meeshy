import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Une limite se dit À la limite, une fois par geste** (#13839, L3) :
/// message bref, annonce VoiceOver et vibration d'avertissement — et la frappe
/// qui bute sur le plafond ne vibre pas à chaque caractère.
@MainActor
final class ComposerLimitNoticeTests: XCTestCase {

    private final class Haut: ComposerLimitSpeaking {
        var dits: [String] = []
        func say(_ message: String) { dits.append(message) }
    }

    private func tableau(_ haut: Haut, horloge: @escaping () -> Date) -> ComposerLimitNoticeBoard {
        ComposerLimitNoticeBoard(speaker: haut, clock: horloge)
    }

    func test_report_firstTimeAtTheLimit_speaksTheBound() {
        let haut = Haut()
        tableau(haut, horloge: { Date(timeIntervalSince1970: 0) }).report(.sticker)
        XCTAssertEqual(haut.dits, [ComposerLimitFeedback.message(for: .sticker)])
    }

    func test_report_sameLimitWithinTheQuietWindow_staysSilent() {
        let haut = Haut()
        var t: TimeInterval = 0
        let board = tableau(haut, horloge: { Date(timeIntervalSince1970: t) })
        board.report(.textLength)
        t = 0.5
        board.report(.textLength)
        t = 1.2
        board.report(.textLength)
        XCTAssertEqual(haut.dits.count, 1, "une frappe qui bute ne vibre qu'une fois")
    }

    func test_report_sameLimitAfterTheQuietWindow_speaksAgain() {
        let haut = Haut()
        var t: TimeInterval = 0
        let board = tableau(haut, horloge: { Date(timeIntervalSince1970: t) })
        board.report(.sticker)
        t = ComposerLimitNotice.quietInterval + 0.1
        board.report(.sticker)
        XCTAssertEqual(haut.dits.count, 2)
    }

    func test_report_anotherLimit_speaksAtOnce() {
        let haut = Haut()
        let board = tableau(haut, horloge: { Date(timeIntervalSince1970: 0) })
        board.report(.sticker)
        board.report(.image)
        XCTAssertEqual(haut.dits.count, 2)
    }

    // MARK: - #17111 : la capsule remplace le toast

    private func capsuleFigee() -> ComposerLimitCapsule {
        ComposerLimitCapsule(sleep: { _ in try? await Task.sleep(for: .seconds(3600)) })
    }

    func test_systemSpeaker_showsTheCapsule_vibrates_andSpeaksToVoiceOver() {
        let capsule = capsuleFigee()
        var vibrations = 0
        var annonces: [String] = []
        FeedbackToastManager.shared.currentToast = nil
        ComposerSystemLimitSpeaker(capsule: capsule,
                                   haptic: { vibrations += 1 },
                                   announce: { annonces.append($0) }).say("50 stickers au maximum par scène")
        XCTAssertEqual(capsule.message, "50 stickers au maximum par scène")
        XCTAssertEqual(vibrations, 1, "la borne se SENT")
        XCTAssertEqual(annonces, ["50 stickers au maximum par scène"], "et se DIT à VoiceOver")
        XCTAssertNil(FeedbackToastManager.shared.currentToast, "plus aucun toast pour une limite")
    }

    func test_capsule_aNewRefusal_replacesThePreviousOne() {
        let capsule = capsuleFigee()
        capsule.show("A")
        capsule.show("B")
        XCTAssertEqual(capsule.message, "B")
    }

    func test_capsule_retiresItselfAfterItsDelay() async {
        let capsule = ComposerLimitCapsule(sleep: { _ in })
        capsule.show("A")
        for _ in 0..<20 where capsule.message != nil { await Task.yield() }
        XCTAssertNil(capsule.message)
    }

    func test_capsule_anOldTimerNeverRetiresANewerMessage() {
        let capsule = capsuleFigee()
        capsule.show("A")
        capsule.show("B")
        capsule.retire(ifStill: 1)
        XCTAssertEqual(capsule.message, "B", "le minuteur du premier refus ne retire pas le second")
    }

    /// **La capsule se pose AU-DESSUS DE LA PILULE** (L12), jamais sous ✕ où
    /// elle croisait la rangée des scènes et s'éloignait du geste refusé.
    func test_capsuleView_seposeAuDessusDeLaPilule() throws {
        let code = try ComposerSceneArrangementTests.source("ComposerLimitFeedback.swift")
            .filter { !$0.isWhitespace }
        XCTAssertTrue(code.contains("VStack(spacing:0){Spacer(minLength:0)ifletmessage=capsule.message"),
                      "le vide AVANT la capsule la pousse en bas, sur le socle")
        XCTAssertTrue(code.contains(".move(edge:.bottom)"))
        XCTAssertFalse(code.contains(".padding(.top,ComposerSceneRoundGlyph.size"), "plus sous ✕")
    }
}
