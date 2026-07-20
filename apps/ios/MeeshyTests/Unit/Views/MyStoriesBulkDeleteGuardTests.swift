import XCTest
@testable import Meeshy

/// Source-analysis guard for multi-select bulk delete in `MyStoriesView`.
/// Directive user 2026-07-14.
final class MyStoriesBulkDeleteGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_myStoriesView_neverReadsSelectedIDsRaw_outsideItsOwnDeclarationAndToggle() throws {
        let viewSource = try source("Meeshy/Features/Main/Views/MyStoriesView.swift")

        XCTAssertTrue(
            viewSource.contains("private var selectedStoryIDs: Set<String>"),
            "MyStoriesView doit exposer selectedStoryIDs (filtré via StorySelectionResolver.liveSelection), pas lire selectedIDs brut ailleurs."
        )
        XCTAssertTrue(
            viewSource.contains("StorySelectionResolver.liveSelection(selectedIDs: selectedIDs, liveIDs: stories.map(\\.id))"),
            "selectedStoryIDs doit être calculé via StorySelectionResolver.liveSelection."
        )
    }

    func test_bulkDelete_reusesExistingDeleteStory_noNewViewModelMethod() throws {
        let viewSource = try source("Meeshy/Features/Main/Views/MyStoriesView.swift")

        guard let funcRange = viewSource.range(of: "private func bulkDelete()") else {
            XCTFail("MyStoriesView doit définir bulkDelete()")
            return
        }
        let end = viewSource.index(funcRange.lowerBound, offsetBy: 700, limitedBy: viewSource.endIndex)
            ?? viewSource.endIndex
        let block = String(viewSource[funcRange.lowerBound ..< end])

        XCTAssertTrue(
            block.contains("await viewModel.deleteStory(storyId: id)"),
            "bulkDelete() doit réutiliser StoryViewModel.deleteStory(storyId:) en boucle, pas introduire une nouvelle méthode réseau. Bloc lu: \(block)"
        )
        XCTAssertTrue(
            block.contains("selectedIDs.subtract(ids)"),
            "bulkDelete() doit retirer uniquement les ids traités (selectedIDs.subtract(ids)), pas selectedIDs.removeAll() — sinon une story sélectionnée pendant les appels réseau en cours est effacée en silence. Bloc lu: \(block)"
        )
    }

    /// L'état de sélection est transmis à VoiceOver via la trait de la ligne
    /// (même pattern que `NewConversationView`) — le glyphe de sélection
    /// reste décoratif, jamais porteur de son propre label.
    func test_myStoryRow_selection_conveyedViaRowTrait_notGlyphLabel() throws {
        let viewSource = try source("Meeshy/Features/Main/Views/MyStoriesView.swift")

        XCTAssertTrue(
            viewSource.contains(".accessibilityAddTraits(isSelected ? .isSelected : [])"),
            "MyStoryRow doit porter .accessibilityAddTraits(isSelected ? .isSelected : []) sur la ligne."
        )
        guard let circleRange = viewSource.range(of: "private var selectionCircle: some View {") else {
            XCTFail("MyStoryRow doit définir selectionCircle")
            return
        }
        let end = viewSource.index(circleRange.lowerBound, offsetBy: 320, limitedBy: viewSource.endIndex)
            ?? viewSource.endIndex
        let circleBlock = String(viewSource[circleRange.lowerBound ..< end])
        XCTAssertTrue(
            circleBlock.contains(".accessibilityHidden(true)"),
            "Le glyphe de sélection doit être décoratif (.accessibilityHidden(true)) — l'état est porté par la ligne. Bloc lu: \(circleBlock)"
        )
    }
}

// MARK: - Menu « … » / export destination (fix 2026-07-19)

/// Le menu « … » des lignes My Stories offre « Enregistrer » : même pipeline
/// d'export MP4 que « Partager », mais la share sheet système ne doit JAMAIS
/// se présenter en mode `.saveToPhotos` (la vidéo part dans Photos via
/// `PhotoLibraryManager`). `resolveActivityURL` est la garde pure de ce choix.
@MainActor
final class StoryExportShareSheetModeTests: XCTestCase {

    func test_resolveActivityURL_shareMode_passesURLThrough() {
        let url = URL(string: "file:///tmp/story.mp4")!
        XCTAssertEqual(StoryExportShareSheet.resolveActivityURL(mode: .share, sharedURL: url), url)
        XCTAssertNil(StoryExportShareSheet.resolveActivityURL(mode: .share, sharedURL: nil))
    }

    func test_resolveActivityURL_saveToPhotos_neverPresentsShareSheet() {
        let url = URL(string: "file:///tmp/story.mp4")!
        XCTAssertNil(StoryExportShareSheet.resolveActivityURL(mode: .saveToPhotos, sharedURL: url),
                     "En mode Enregistrer, l'URL exportée est consommée par la sauvegarde Photos — pas de share sheet.")
    }
}
