import XCTest
import SwiftUI
@testable import Meeshy

/// Stage Manager / Split View / fenêtre détachée (cycle 7). `DeviceLayout.windowSize` lit la fenêtre CLÉ de la scène
/// active : une vue de l'AUTRE fenêtre de l'app mesurait la mauvaise, et la lecture ne relance aucun rendu quand la
/// fenêtre change de taille. Chaque racine de fenêtre publie sa taille (`publishingSceneWindowSize`, éprouvé dans
/// `SceneWindowSizeTests` à une fenêtre de 320 pt) ; les écrans qui débordaient la lisent, ou mesurent leur propre
/// conteneur. La fenêtre active ne reste qu'un REPLI, avant la première mesure.
final class SceneWindowSizeWiringGuardTests: XCTestCase {

    private func source(_ path: String) throws -> String { try AppSourceGuard.unit(path) }

    /// Publiée le plus à l'EXTÉRIEUR de chaque `WindowGroup` (cycle 8) : posée sous `AdaptiveRootView`, la
    /// publication laissait hors de portée les feuilles et couvertures montées plus haut (`MeeshyApp` : feuille de
    /// lien, couvertures visiteur et invité, feuille de plantage, toasts, barrière d'âge) — elles retombaient sur la
    /// fenêtre clé.
    func test_everyWindowGroup_publishesItsSize_outermost() throws {
        let app = AppSourceGuard.stripComments(try source("Meeshy/MeeshyApp.swift"))
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            .joined(separator: "\n") + "\n"
        XCTAssertTrue(app.contains("""
                }
            }
            }
            .publishingSceneWindowSize()
        }
"""), "la fenêtre principale publie sa taille sur MainWindowGate, après tout ce qu'il porte")
        XCTAssertTrue(app.contains("""
                .meeshyThemeRoot(theme)
                .publishingSceneWindowSize()
        }
        .handlesExternalEvents(matching: [DetachedWindowOpener.activityIdentifier])
"""), "la fenêtre détachée publie sa taille après ses toasts et sa barrière d'âge")

        let roots = AppSourceGuard.stripComments(try source("Meeshy/Features/Main/Views/AdaptiveRootView.swift"))
        XCTAssertFalse(roots.contains(".publishingSceneWindowSize()"),
                       "une seule publication par fenêtre : la racine du WindowGroup")
    }

    func test_theStoryViewer_readsItsWindow_notTheKeyWindow() throws {
        let viewer = try source("Meeshy/Features/Stories/Views/StoryViewerView.swift")
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
            "Meeshy/Features/Main/Views/MessageMenuPreviewContainer.swift",
            "Meeshy/Features/Main/Views/ConversationView+LongPressMenu.swift",
            "Meeshy/Features/Main/Views/AudioFullscreenView.swift",
            "Meeshy/Features/Main/Views/AudioFullscreenDismissDrag.swift",
        ] {
            let code = AppSourceGuard.stripComments(try source(path))
            XCTAssertFalse(code.contains("DeviceLayout.windowSize.height"), "\(path) lit encore la fenêtre clé")
        }
    }

    /// Cycle 8 : les marges sûres. Lues sur la fenêtre CLÉ pendant `body`, elles demandaient à UIKit les marges
    /// d'une fenêtre — l'aller-retour qui a fait planter le viewer de story (#10566) et geler l'écran d'appel et le
    /// mini-lecteur (#8772, #9048) — et pouvaient être celles de l'autre fenêtre. Elles se lisent désormais dans
    /// `\.sceneSafeAreaInsets`, mesuré par la racine hors de `body`. L'écran d'appel garde sa lecture (#8725) : il
    /// vit dans sa propre fenêtre, qu'aucune racine publiante ne couvre.
    func test_theSafeAreaReads_useTheirWindow() throws {
        for path in [
            "Meeshy/Features/Main/Components/UniversalComposerBar.swift",
            "Meeshy/Features/Main/Components/TopChromeTint.swift",
            "Meeshy/Features/Main/Views/ConversationMediaGalleryView+Scrims.swift",
            "Meeshy/Features/Main/Views/ConversationMediaGalleryView+Geometry.swift",
            "Meeshy/Features/Main/Views/ConversationView.swift",
            "Meeshy/Features/Main/Views/ReelsPlayerView+Scene.swift",
        ] {
            let code = AppSourceGuard.stripComments(try source(path))
            XCTAssertFalse(code.contains("DeviceLayout.safeAreaTop"), "\(path) lit encore la marge haute de la fenêtre clé")
            XCTAssertFalse(code.contains("DeviceLayout.safeAreaBottom"), "\(path) lit encore la marge basse de la fenêtre clé")
            // La galerie déclare ses marges une fois (`galleryInsets`, ConversationMediaGalleryView.swift).
            XCTAssertTrue(code.contains("WindowInsets(published: sceneSafeAreaInsets)") || code.contains("galleryInsets."),
                          "\(path) doit lire SA fenêtre")
        }
        // #12470 : le repli ne lit plus JAMAIS la fenêtre. Un `fullScreenCover` (composeur, réels, bande du haut) ne
        // reçoit pas la publication ; lire `UIWindow.safeAreaInsets` pendant son `body` rappelait le contrôleur hôte
        // (`statusBarHidden`) — cycle du graphe, gel de 83 s, 0x8BADF00D sur iPhone.
        let layout = AppSourceGuard.stripComments(try source("Meeshy/Core/DeviceLayout.swift"))
        let windowInsets = try XCTUnwrap(Self.declaration(of: "struct WindowInsets", in: layout),
                                         "WindowInsets doit rester dans DeviceLayout.swift, sinon la garde ne garde rien")
        for windowRead in ["DeviceLayout.safeArea", "safeAreaInsets", "measurementWindow", "UIWindow", "keyWindow", "WindowMetrics"] {
            XCTAssertFalse(windowInsets.contains(windowRead),
                           "le repli de WindowInsets lit encore la fenêtre (\(windowRead)) pendant body")
        }
    }

    func test_theInsetsGuard_seesAWindowReadSmuggledIntoTheFallback() throws {
        let smuggled = """
        struct WindowInsets {
            let published: EdgeInsets?
            var top: CGFloat { published?.top ?? measurementWindow?.safeAreaInsets.top ?? 0 }
        }
        struct Other {}
        """
        let declaration = try XCTUnwrap(Self.declaration(of: "struct WindowInsets", in: smuggled))
        XCTAssertTrue(declaration.contains("safeAreaInsets"))
        XCTAssertFalse(declaration.contains("struct Other"), "la déclaration s'arrête à sa propre accolade")
        XCTAssertNil(Self.declaration(of: "struct WindowInsets", in: "struct Renamed {}"))
    }

    private static func declaration(of header: String, in code: String) -> String? {
        guard let start = code.range(of: header + " {") else { return nil }
        var depth = 1
        var index = start.upperBound
        while index < code.endIndex, depth > 0 {
            if code[index] == "{" { depth += 1 }
            if code[index] == "}" { depth -= 1 }
            index = code.index(after: index)
        }
        return depth == 0 ? String(code[start.lowerBound..<index]) : nil
    }

    @MainActor
    func test_windowInsets_withoutPublication_servesTheRememberedInsets_neverTheKeyWindow() {
        let remembered = EdgeInsets(top: 59, leading: 0, bottom: 34, trailing: 0)
        let published = EdgeInsets(top: 47, leading: 0, bottom: 21, trailing: 0)
        let served = WindowInsets(published: published, remembered: remembered)
        let cover = WindowInsets(published: nil, remembered: remembered)
        let firstPass = WindowInsets(published: nil, remembered: nil)

        XCTAssertEqual(served.top, 47, "la publication prime")
        XCTAssertEqual([cover.top, cover.bottom], [59, 34], "couverture : la mesure de la racine")
        XCTAssertEqual([firstPass.top, firstPass.bottom], [0, 0], "aucune mesure : zéro le temps d'une passe")
    }
}
