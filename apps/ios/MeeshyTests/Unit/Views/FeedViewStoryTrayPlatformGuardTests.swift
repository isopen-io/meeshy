import XCTest
@testable import Meeshy

/// Garde de source : sur iPad les deux colonnes sont visibles EN MÊME TEMPS, et
/// la liste de conversations (colonne droite) porte déjà `StoryTrayView`.
/// L'afficher aussi dans le fil (colonne gauche) montrait la MÊME rangée
/// d'avatars deux fois côte à côte et repoussait les publications vers le bas.
///
/// Le tray reste sur iPhone, où le fil et la liste sont deux écrans distincts.
///
/// Garde ancrée sur le COMPORTEMENT (« le tray est conditionné à la classe de
/// taille »), pas sur une mise en forme : un renommage de variable ou un
/// reformatage ne doit pas la faire tomber.
@MainActor
final class FeedViewStoryTrayPlatformGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_feedStoryTray_isGatedOnCompactWidth() throws {
        let feedSource = try source("Meeshy/Features/Main/Views/FeedView.swift")

        guard let trayRange = feedSource.range(of: "StoryTrayView(viewModel: storyViewModel)") else {
            XCTFail("FeedView doit continuer à monter StoryTrayView pour l'iPhone.")
            return
        }

        // Fenêtre AMONT : la condition de classe de taille doit précéder
        // immédiatement le montage du tray.
        let windowStart = feedSource.index(trayRange.lowerBound, offsetBy: -200, limitedBy: feedSource.startIndex)
            ?? feedSource.startIndex
        let preceding = String(feedSource[windowStart ..< trayRange.lowerBound])

        XCTAssertTrue(
            preceding.contains("sizeClass != .regular"),
            "Le tray de stories du fil doit être conditionné à `sizeClass != .regular`. " +
            "Sur iPad (classe régulière → iPadRootView, cf. AdaptiveRootView) la colonne " +
            "droite affiche déjà ce même tray : le monter ici le duplique à l'écran."
        )
    }

    /// Non-régression du chargement : masquer le tray ne doit pas cesser de
    /// charger les stories — les anneaux d'auteur des cartes du fil en dépendent,
    /// sur iPad comme sur iPhone.
    func test_feedStillLoadsStories_evenWhereTrayIsHidden() throws {
        let feedSource = try source("Meeshy/Features/Main/Views/FeedView.swift")
        XCTAssertTrue(
            feedSource.contains("storyViewModel.loadStories"),
            "Le fil doit continuer à charger les stories même là où le tray est masqué : " +
            "`storyRingState(forUserId:)` alimente l'anneau d'auteur de chaque carte."
        )
    }
}
