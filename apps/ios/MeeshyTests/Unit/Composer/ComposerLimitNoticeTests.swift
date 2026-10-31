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

    func test_systemSpeaker_showsANoticeToast_notAnError() {
        FeedbackToastManager.shared.currentToast = nil
        ComposerSystemLimitSpeaker().say("50 stickers au maximum par scène")
        XCTAssertEqual(FeedbackToastManager.shared.currentToast?.message, "50 stickers au maximum par scène")
        XCTAssertEqual(FeedbackToastManager.shared.currentToast?.type, .info,
                       "une limite n'est pas une erreur : avertissement bref, pas une alarme")
    }
}
