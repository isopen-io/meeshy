import XCTest
@testable import Meeshy

@MainActor
final class ConversationInfoSheetAccessibilityTests: XCTestCase {

    private func sheetSource(named file: String = "ConversationInfoSheet.swift") throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/\(file)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// The vicinity following a source anchor, so an assertion targets the button
    /// next to that anchor rather than any same-key occurrence elsewhere in the file.
    private func vicinity(after anchor: String, in source: String, span: Int = 400) throws -> String {
        guard let range = source.range(of: anchor) else {
            XCTFail("ConversationInfoSheet must contain \(anchor)")
            return ""
        }
        let end = source.index(range.upperBound, offsetBy: span, limitedBy: source.endIndex) ?? source.endIndex
        return String(source[range.upperBound ..< end])
    }

    // MARK: - #17907 — la fiche défile d'un bloc et épingle ses onglets, comme la fiche profil

    func test_sheet_scrollsAsOneBlock_withPinnedTabBar() throws {
        let source = try sheetSource()
        let layout = try vicinity(after: "private var collapsibleLayout: some View {", in: source, span: 1_400)
        XCTAssertTrue(layout.contains("LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders])"),
                      "La fiche est UN défilement dont l'en-tête de section (les onglets) s'épingle, comme `UserProfileSheet`.")
        XCTAssertTrue(layout.contains("pinnedTabBar(offset: offset)"),
                      "Les onglets sont l'en-tête épinglé de la section, pas une rangée figée au-dessus du défilement.")
        XCTAssertTrue(layout.contains("collapsibleHeader(offset: offset)"),
                      "L'en-tête de la conversation défile avec le contenu et s'efface, comme celui du profil.")
        XCTAssertTrue(source.contains("compactPinnedBar"),
                      "Une barre compacte prend le relais de l'en-tête replié.")
    }

    func test_tabContent_hasNoNestedScrollView() throws {
        let source = try sheetSource()
        let content = try vicinity(after: "private var tabContent: some View {", in: source, span: 700)
        XCTAssertFalse(content.contains("ScrollView("),
                       "Le contenu d'onglet vit dans le défilement de la fiche : un ScrollView imbriqué le réduirait à la bande restante.")
    }

    // MARK: - Member-search clear button

    func test_memberSearchClearButton_hasAccessibilityLabel() throws {
        // The icon-only `xmark.circle.fill` that clears the member-search field
        // carried no accessible name — VoiceOver announced a bare "button".
        let source = try sheetSource()
        let nearClear = try vicinity(after: "memberSearchQuery = \"\"", in: source)
        XCTAssertTrue(
            nearClear.contains("common.clear-search"),
            "The member-search clear button (xmark.circle.fill) must carry the common.clear-search " +
            "accessibility label so VoiceOver announces 'Effacer la recherche', not an unnamed button — " +
            "matching every other search-field clear button in the app."
        )
    }

    // MARK: - Pinned-messages sheet close button

    func test_pinnedMessagesCloseButton_hasAccessibilityLabel() throws {
        // The toolbar `xmark` that dismisses the "all pinned messages" sheet had
        // no accessible name; it must reuse the same common.close key as the
        // primary info-sheet close button (visual + semantic parity).
        // Anchored on the pinned sheet's navigation title (unique) rather than
        // `showAllPinnedMessages = false` — the latter first matches the @State
        // declaration far above the toolbar button.
        // #8103 — la feuille des épinglés a quitté la fiche pour son extension.
        let source = try sheetSource(named: "ConversationInfoSheet+Pinned.swift")
        let nearClose = try vicinity(after: "conversation.info.pinned.title", in: source, span: 900)
        XCTAssertTrue(
            nearClose.contains("common.close"),
            "The pinned-messages sheet close button (xmark) must carry the common.close accessibility " +
            "label so VoiceOver announces 'Fermer' — its glyph alone conveys no action to VoiceOver users."
        )
    }
}
