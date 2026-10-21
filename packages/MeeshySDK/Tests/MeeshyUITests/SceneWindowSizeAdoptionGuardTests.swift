import XCTest

/// Stage Manager / Split View (cycle 7, lot 2) : les primitives MeeshyUI qui se dimensionnaient sur la fenêtre CLÉ
/// (squelettes de la liste, feuille de langues, visionneuse) se mesurent à la fenêtre qui les porte
/// (`\.sceneWindowSize`, voir `SceneWindowSizeTests`) ; `WindowMetrics` ne reste qu'un repli.
final class SceneWindowSizeAdoptionGuardTests: XCTestCase {

    private func source(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
        return try String(contentsOf: root.appendingPathComponent(relative), encoding: .utf8)
    }

    func test_thePrimitives_sizeOnTheirWindow() throws {
        let forbidden = [
            "Sources/MeeshyUI/Primitives/SkeletonView.swift": ["min(WindowMetrics.windowSize", "= WindowMetrics.windowSize.width"],
            "Sources/MeeshyUI/Primitives/LanguagePickerSheet.swift": ["min(WindowMetrics.windowSize"],
            "Sources/MeeshyUI/Media/ImageViewerView.swift": ["return WindowMetrics.windowSize.height"],
        ]
        for (path, needles) in forbidden {
            let code = try source(path)
            for needle in needles {
                XCTAssertFalse(code.contains(needle), "\(path) lit encore la fenêtre clé (\(needle))")
            }
            XCTAssertTrue(code.contains("SceneWindowSize.resolve(sceneWindowSize"), "\(path) doit lire sa fenêtre")
        }
    }

    /// Cycle 8 : les marges sûres des surfaces plein écran (composer de story, éditeur d'image, contrôles vidéo) se
    /// lisent dans `\.sceneSafeAreaInsets`, mesuré hors de `body`, plus sur la fenêtre clé pendant le rendu.
    func test_theFullscreenChrome_readsItsWindowsSafeArea() throws {
        for path in [
            "Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift",
            "Sources/MeeshyUI/Media/MeeshyImageEditorView.swift",
            "Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift",
        ] {
            let code = try source(path)
            XCTAssertFalse(code.contains("WindowMetrics.safeAreaInsets"), "\(path) lit encore les marges de la fenêtre clé")
            XCTAssertTrue(code.contains("SceneWindowSize.resolveInsets(sceneSafeAreaInsets"), "\(path) doit lire sa fenêtre")
        }
    }
}
