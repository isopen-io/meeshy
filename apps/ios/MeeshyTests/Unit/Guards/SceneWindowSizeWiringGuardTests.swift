import XCTest
@testable import Meeshy

/// Stage Manager / Split View / fenêtre détachée (cycle 7). `DeviceLayout.windowSize` lit la fenêtre CLÉ de la scène
/// active : une vue de l'AUTRE fenêtre de l'app mesurait la mauvaise, et la lecture ne relance aucun rendu quand la
/// fenêtre change de taille. Chaque racine de fenêtre publie sa taille (`publishingSceneWindowSize`, éprouvé dans
/// `SceneWindowSizeTests` à une fenêtre de 320 pt) ; les écrans qui débordaient la lisent, ou mesurent leur propre
/// conteneur. La fenêtre active ne reste qu'un REPLI, avant la première mesure.
final class SceneWindowSizeWiringGuardTests: XCTestCase {

    private func source(_ path: String) throws -> String { try AppSourceGuard.unit(path) }

    func test_everyWindowRoot_publishesItsOwnSize() throws {
        let roots = try source("Meeshy/Features/Main/Views/AdaptiveRootView.swift")
        let publications = roots.components(separatedBy: ".publishingSceneWindowSize()").count - 1
        XCTAssertGreaterThanOrEqual(publications, 2, "la fenêtre principale ET la fenêtre détachée publient leur taille")
    }

    func test_theStoryViewer_readsItsWindow_notTheKeyWindow() throws {
        let viewer = try source("Meeshy/Features/Main/Views/StoryViewerView.swift")
        XCTAssertTrue(viewer.contains("SceneWindowSize.resolve(sceneWindowSize, fallback: DeviceLayout.windowSize)"))
        XCTAssertFalse(viewer.contains("private var windowSize: CGSize { DeviceLayout.windowSize }"))
    }

    func test_theComposerBar_sizesItsPanelOnItsWindow() throws {
        let bar = try source("Meeshy/Features/Main/Components/UniversalComposerBar.swift")
        XCTAssertFalse(bar.contains("windowHeight: DeviceLayout.windowSize.height"),
                       "le panneau d'attachements se borne à la hauteur de SA fenêtre")
        XCTAssertTrue(bar.contains("@Environment(\\.sceneWindowSize)"))
    }

    func test_theFilmstrip_insetsOnItsOwnWidth() throws {
        let strip = try source("Meeshy/Features/Main/Views/ConversationMediaFilmstrip.swift")
        XCTAssertFalse(strip.contains("containerWidth: DeviceLayout.windowSize.width"),
                       "la bande se cale sur SA largeur mesurée (colonne, fenêtre étroite)")
    }

    func test_theListTail_isHalfOfItsOwnColumn() throws {
        let list = try source("Meeshy/Features/Main/Views/ConversationListView.swift")
        XCTAssertFalse(list.contains("DeviceLayout.windowSize.height / 2"),
                       "la queue de liste se mesure à la colonne, pas à la fenêtre")
    }

    /// Lot 2 : menus d'appui long, aperçu, plein écran audio — chacun se mesure à la fenêtre qui le porte.
    func test_theRemainingLayoutReads_useTheirWindow() throws {
        for path in [
            "Meeshy/Features/Main/Views/MessageListView.swift",
            "Meeshy/Features/Main/Views/ConversationView+LongPressMenu.swift",
            "Meeshy/Features/Main/Views/AudioFullscreenView.swift",
            "Meeshy/Features/Main/Views/AudioFullscreenDismissDrag.swift",
        ] {
            let code = AppSourceGuard.stripComments(try source(path))
            XCTAssertFalse(code.contains("DeviceLayout.windowSize.height"), "\(path) lit encore la fenêtre clé")
        }
    }
}
