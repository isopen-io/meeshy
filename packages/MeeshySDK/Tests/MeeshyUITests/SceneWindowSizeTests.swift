import XCTest
import SwiftUI
@testable import MeeshyUI

/// iPad Split View / Stage Manager / fenêtre détachée : la taille lue sur « la fenêtre active » est celle de la
/// fenêtre CLÉ, pas celle qui porte la vue, et elle ne relance aucun rendu quand la fenêtre change de taille.
/// Chaque racine de fenêtre publie désormais SA taille dans l'environnement.
@MainActor
final class SceneWindowSizeTests: XCTestCase {

    private final class Seen { var size: CGSize? }

    private struct Probe: View {
        let seen: Seen
        @Environment(\.sceneWindowSize) private var sceneWindowSize
        var body: some View {
            Color.clear.onAppear { seen.size = sceneWindowSize }
                .onChange(of: sceneWindowSize) { seen.size = $0 }
        }
    }

    private func layOut(_ view: some View, in frame: CGRect) -> UIWindow {
        let window = UIWindow(frame: frame)
        window.rootViewController = UIHostingController(rootView: view)
        window.isHidden = false
        window.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.2))
        return window
    }

    func test_aRootPublishesItsOwnWindowSize_narrowerThanTheScreen() {
        let seen = Seen()
        let narrow = CGRect(x: 0, y: 0, width: 320, height: 600)
        let window = layOut(Probe(seen: seen).publishingSceneWindowSize(), in: narrow)
        defer { window.isHidden = true }

        XCTAssertEqual(seen.size?.width ?? 0, 320, accuracy: 0.5, "la largeur de SA fenêtre, pas celle de l'écran")
        XCTAssertEqual(seen.size?.height ?? 0, 600, accuracy: 0.5)
    }

    func test_aResizedWindow_republishesItsSize() {
        let seen = Seen()
        let window = layOut(Probe(seen: seen).publishingSceneWindowSize(), in: CGRect(x: 0, y: 0, width: 700, height: 600))
        defer { window.isHidden = true }

        window.frame = CGRect(x: 0, y: 0, width: 375, height: 600)
        window.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.2))

        XCTAssertEqual(seen.size?.width ?? 0, 375, accuracy: 0.5, "Stage Manager : la fenêtre rétrécie se republie")
    }

    func test_resolve_prefersTheMeasuredSize_andFallsBackOnlyWithoutIt() {
        let fallback = CGSize(width: 1024, height: 1366)
        XCTAssertEqual(SceneWindowSize.resolve(CGSize(width: 320, height: 600), fallback: fallback), CGSize(width: 320, height: 600))
        XCTAssertEqual(SceneWindowSize.resolve(nil, fallback: fallback), fallback)
        XCTAssertEqual(SceneWindowSize.resolve(.zero, fallback: fallback), fallback, "une mesure vide n'est pas une mesure")
    }
}
