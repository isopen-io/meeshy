import XCTest
import MeeshySDK
@testable import Meeshy

/// #7614 — la ligne d'un éphémère REÇU décompte depuis sa réception et bascule
/// seule en « Message expiré » à l'échéance.
///
/// `message:new` ne porte pas d'échéance pour un éphémère (#7451) : la ligne
/// n'avait que la DURÉE, affichait « 1 min » figé, ne basculait jamais, et le
/// texte protégé restait lisible dans la liste après l'échéance.
final class ConversationPreviewLineEphemeralTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_790_000_000)

    private func makeLedger() -> EphemeralReceiptLedger {
        EphemeralReceiptLedger(defaults: UserDefaults(suiteName: "meeshy.tests.\(UUID().uuidString)")!)
    }

    private func ephemeralRow(senderName: String) -> MeeshyConversation {
        var row = MeeshyConversation(
            id: "conv-1", identifier: "conv-1", type: .group, lastMessageAt: t0,
            lastMessagePreview: "SECRET-EPHEMERE rendez-vous", lastMessageId: "m-eph"
        )
        row.lastMessageSenderName = senderName
        row.lastMessageNature = LastMessageNature(ephemeralDuration: 60)
        return row
    }

    private func compose(
        _ row: MeeshyConversation, at now: Date, ledger: EphemeralReceiptRecording
    ) -> ConversationPreview {
        ConversationPreviewLine.preview(
            for: row, viewerId: "u-me", preferredLanguages: ["fr"], now: now,
            strings: ConversationPreviewCatalog.strings(language: "fr"), receipts: ledger
        )
    }

    private func carriesTheText(_ preview: ConversationPreview) -> Bool {
        preview.segments.contains { $0.text.contains("SECRET-EPHEMERE") }
    }

    func test_preview_receivedEphemeral_countsDownFromItsReception() {
        let ledger = makeLedger()
        let row = ephemeralRow(senderName: "Demo")

        let first = compose(row, at: t0, ledger: ledger)
        let later = compose(row, at: t0.addingTimeInterval(9), ledger: ledger)

        XCTAssertEqual(first.liveUntil, t0.addingTimeInterval(60), "l'échéance part de la PREMIÈRE réception")
        XCTAssertEqual(later.liveUntil, t0.addingTimeInterval(60), "une recomposition ne relance pas l'horloge")
        guard case .countdown(_, let expiresAt)? = later.segments.first else {
            return XCTFail("un éphémère reçu porte un décompte, pas sa seule durée")
        }
        XCTAssertEqual(expiresAt, t0.addingTimeInterval(60))
    }

    func test_preview_recomposedAtItsLiveDeadline_saysExpiredAndHidesTheText() throws {
        let ledger = makeLedger()
        let row = ephemeralRow(senderName: "Demo")
        let live = compose(row, at: t0, ledger: ledger)
        XCTAssertTrue(carriesTheText(live), "vivant, l'éphémère se lit")

        let deadline = try XCTUnwrap(live.liveUntil)
        let expired = compose(row, at: deadline, ledger: ledger)

        XCTAssertEqual(expired.icon, .expired)
        XCTAssertNil(expired.liveUntil, "une ligne expirée ne se réveille plus")
        XCTAssertFalse(carriesTheText(expired), "le texte protégé quitte la liste à l'échéance")
    }

    func test_preview_myOwnEphemeral_neverStampsAReception() {
        let ledger = makeLedger()
        let row = ephemeralRow(senderName: ConversationListAuthor.readerLabel)

        let preview = compose(row, at: t0, ledger: ledger)

        XCTAssertNil(preview.liveUntil, "mon envoi ne décompte qu'à la réception d'un autre")
        XCTAssertNil(ledger.firstReception(of: "m-eph"))
    }

    func test_preview_ordinaryMessage_neverTouchesTheLedger() {
        let ledger = makeLedger()
        var row = ephemeralRow(senderName: "Demo")
        row.lastMessageNature = nil

        _ = compose(row, at: t0, ledger: ledger)

        XCTAssertNil(ledger.firstReception(of: "m-eph"))
    }
}
