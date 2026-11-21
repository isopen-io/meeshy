import XCTest
@testable import MeeshyUI

/// #18873, planche `Signaler` — un motif parmi huit, un mot facultatif de 500 signes, « Bloquer aussi ». Rien ne part
/// sans motif, le mot part sans ses blancs, et un mot vide ne part pas.
final class ProfileReportDraftTests: XCTestCase {

    func test_emptyDraft_cannotBeSent() {
        XCTAssertFalse(ProfileReportDraft().canSend)
    }

    func test_choosing_aKnownReason_makesTheDraftSendable() {
        let draft = ProfileReportDraft().choosing("harassment")

        XCTAssertEqual(draft.reason, .harassment)
        XCTAssertTrue(draft.canSend)
    }

    func test_choosing_anUnknownId_changesNothing() {
        let draft = ProfileReportDraft().choosing("spam").choosing("not-a-reason")

        XCTAssertEqual(draft.reason, .spam)
    }

    func test_choosing_keepsTheWordAndTheBlockChoice() {
        let draft = ProfileReportDraft().writing("Il insiste").togglingBlock().choosing("violence")

        XCTAssertEqual(draft.details, "Il insiste")
        XCTAssertTrue(draft.alsoBlocks)
    }

    func test_writing_isCutAtFiveHundredSigns() {
        let draft = ProfileReportDraft().writing(String(repeating: "a", count: 600))

        XCTAssertEqual(draft.details.count, ProfileReportDraft.detailsLimit)
        XCTAssertEqual(ProfileReportDraft.detailsLimit, 500)
    }

    func test_sentDetails_dropsSurroundingBlanks_andAnEmptyWord() {
        XCTAssertEqual(ProfileReportDraft().writing("  Il insiste \n").sentDetails, "Il insiste")
        XCTAssertNil(ProfileReportDraft().writing("   \n").sentDetails)
        XCTAssertNil(ProfileReportDraft().sentDetails)
    }

    func test_togglingBlock_twice_returnsToNotBlocking() {
        let draft = ProfileReportDraft().togglingBlock().togglingBlock()

        XCTAssertFalse(draft.alsoBlocks)
    }

    func test_everyReason_carriesTheGatewayValueAndAGlyph() {
        XCTAssertEqual(ProfileReportReason.allCases.map(\.rawValue),
                       ["spam", "inappropriate", "harassment", "violence", "hate_speech", "fake_profile",
                        "impersonation", "other"])
        for reason in ProfileReportReason.allCases {
            XCTAssertFalse(reason.systemImage.isEmpty)
        }
    }

    /// Épure #17584 — le motif se nomme, il ne s'explique pas : la tuile ne porte que son titre et son glyphe.
    @MainActor
    func test_everyReason_hasATitle_andTheTileCarriesNoExplanation() throws {
        for reason in ProfileReportReason.allCases {
            XCTAssertFalse(reason.label.isEmpty)
        }
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Profile/ProfileReportSheet.swift")
        let sheet = try String(contentsOf: url, encoding: .utf8)
        XCTAssertFalse(sheet.contains("detail: reason."), "un motif de signalement ne porte pas de phrase d'explication")
    }

    /// Loi 12 — la feuille est faite du kit : tuiles K47, champ, ligne, bouton, bloc d'état.
    func test_sheet_isMadeOfTheKit() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Profile/ProfileReportSheet.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        for part in ["MeeshyChoiceTiles(", "MeeshyField(", "MeeshyToggleRow(", "MeeshyButton(", "MeeshyStateBlock("] {
            XCTAssertTrue(source.contains(part), part)
        }
        XCTAssertFalse(source.contains("confirmationDialog"))
    }
}
