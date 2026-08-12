import XCTest
@testable import Meeshy

/// Source-analysis guard for multi-select bulk delete in `MyStoriesView`.
/// Directive user 2026-07-14.
final class MyStoriesBulkDeleteGuardTests: XCTestCase {

    /// Le fichier principal est lu comme un CORPUS — les gardes cherchent
    /// dans tous les fichiers de « Mes stories », pour survivre a sa
    /// decomposition. Tout autre chemin est lu tel quel.
    private func source(_ relativePath: String) throws -> String {
        relativePath.hasSuffix("MyStoriesView.swift")
            ? MyStoriesSourceCorpus.text()
            : try MyStoriesSourceCorpus.text(of: relativePath)
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

    func test_publishedGrid_passesSelectionStateToEachCard() throws {
        let viewSource = try source("Meeshy/Features/Main/Views/MyStoriesView.swift")

        XCTAssertTrue(
            viewSource.contains("isSelecting: isSelecting"),
            "La grille publiée doit transmettre le mode sélection à chaque carte — sans lui, taper une carte ne change rien de visible."
        )
        XCTAssertTrue(
            viewSource.contains("isSelected: selectedStoryIDs.contains(story.id)"),
            "L'appartenance au lot se lit sur selectedStoryIDs (le set FILTRÉ aux stories vivantes), pas selectedIDs brut."
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

    // NOTE 2026-08-02 : la garde `test_myStoryRow_selection_conveyedViaRowTrait_
    // notGlyphLabel` a été retirée avec `MyStoryRow` (vue morte depuis la
    // migration en grille, 70f74364c) : elle épinglait `selectionCircle` et le
    // trait `.isSelected` d'une rangée que plus rien ne rendait. La grille
    // (`MyStoryCard`) ne porte PAS encore d'indicateur visuel/a11y de
    // sélection — dette consignée, à réintroduire avec la sélection de cartes.
}
