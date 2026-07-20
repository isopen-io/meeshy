import XCTest
@testable import Meeshy

/// Source-analysis guard for the "Ma story" avatar tap behavior.
///
/// Directive user 2026-07-14 : taper l'avatar "Ma story" doit toujours
/// ouvrir la liste de gestion (`MyStoriesView`), jamais lancer la lecture
/// plein écran directement — la lecture directe reste accessible via le
/// menu contextuel ("Voir ma story").
final class StoryTrayMyStoryTapGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_myStoryButton_onTap_hasMyStory_callsOnManageStories_notOnViewMyStory() throws {
        let trayViewSource = try source("Meeshy/Features/Main/Views/StoryTrayView.swift")

        guard let onTapRange = trayViewSource.range(of: "onTap: {") else {
            XCTFail("MyStoryButton doit définir un closure `onTap:`")
            return
        }
        let end = trayViewSource.index(onTapRange.lowerBound, offsetBy: 260, limitedBy: trayViewSource.endIndex)
            ?? trayViewSource.endIndex
        let onTapBlock = String(trayViewSource[onTapRange.lowerBound ..< end])

        guard let hasMyStoryRange = onTapBlock.range(of: "if hasMyStory {"),
              let elseRange = onTapBlock.range(of: "} else {") else {
            XCTFail("Le closure onTap doit contenir `if hasMyStory { ... } else { ... }`. Bloc lu: \(onTapBlock)")
            return
        }
        let hasMyStoryBranch = String(onTapBlock[hasMyStoryRange.upperBound ..< elseRange.lowerBound])

        XCTAssertTrue(
            hasMyStoryBranch.contains("onManageStories?()"),
            "Le tap sur l'avatar « Ma story » doit ouvrir la liste (onManageStories?()), pas lancer la lecture directe. Branche lue: \(hasMyStoryBranch)"
        )
        XCTAssertFalse(
            hasMyStoryBranch.contains("onViewMyStory()"),
            "onViewMyStory() ne doit plus être appelé directement au tap simple — réservé au menu contextuel « Voir ma story »."
        )
    }

    /// Régression trouvée en revue de code : `PinnedStoryTrailBand` (le band
    /// épinglé qui remplace la grande trail une fois le header scrollé) avait
    /// sa propre logique de tap sur l'anneau « ma story », toujours câblée
    /// sur la lecture directe (`presentStory`) — incohérent avec la directive
    /// appliquée à `MyStoryButton` selon la position de scroll.
    func test_pinnedStoryTrailBand_ownGroupRing_opensListNotDirectPlayback() throws {
        let trayViewSource = try source("Meeshy/Features/Main/Views/StoryTrayView.swift")

        guard let ownGroupRange = trayViewSource.range(of: "if let ownGroup {") else {
            XCTFail("PinnedStoryTrailBand.band doit garder un bloc `if let ownGroup { ... }`")
            return
        }
        let end = trayViewSource.index(ownGroupRange.lowerBound, offsetBy: 300, limitedBy: trayViewSource.endIndex)
            ?? trayViewSource.endIndex
        let ownGroupBlock = String(trayViewSource[ownGroupRange.lowerBound ..< end])

        XCTAssertTrue(
            ownGroupBlock.contains("onViewStory: { showMyStories = true }"),
            "Le tap sur l'anneau « ma story » du band épinglé doit ouvrir la liste (showMyStories = true), pas presentStory(). Bloc lu: \(ownGroupBlock)"
        )
        XCTAssertFalse(
            ownGroupBlock.contains("onViewStory: { presentStory(userId: ownGroup.id) }"),
            "presentStory() ne doit plus être appelé directement pour son propre groupe dans le band épinglé."
        )
    }
}
