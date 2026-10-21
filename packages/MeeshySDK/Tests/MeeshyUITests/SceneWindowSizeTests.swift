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

    // MARK: - Les marges sûres de la fenêtre (cycle 8)

    private final class SeenInsets { var insets: EdgeInsets? }

    private struct InsetsProbe: View {
        let seen: SeenInsets
        @Environment(\.sceneSafeAreaInsets) private var insets
        var body: some View {
            Color.clear.onAppear { seen.insets = insets }
                .onChange(of: insets) { seen.insets = $0 }
        }
    }

    func test_aRootPublishesItsWindowsSafeArea() {
        let seen = SeenInsets()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 600))
        let host = UIHostingController(rootView: InsetsProbe(seen: seen).publishingSceneWindowSize())
        host.additionalSafeAreaInsets = UIEdgeInsets(top: 40, left: 0, bottom: 30, right: 0)
        window.rootViewController = host
        window.isHidden = false
        window.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.2))
        defer { window.isHidden = true }

        // La vérité est celle d'UIKit pour CETTE fenêtre : marges du système (barre d'état du simulateur) plus celles
        // que l'hôte ajoute.
        let truth = host.view.safeAreaInsets
        XCTAssertGreaterThanOrEqual(truth.top, 40, "précondition : la marge ajoutée est prise en compte")
        XCTAssertEqual(seen.insets?.top ?? -1, truth.top, accuracy: 0.5, "la marge haute de SA fenêtre")
        XCTAssertEqual(seen.insets?.bottom ?? -1, truth.bottom, accuracy: 0.5)

        host.additionalSafeAreaInsets = UIEdgeInsets(top: 0, left: 0, bottom: 20, right: 0)
        window.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.2))
        let rotated = host.view.safeAreaInsets
        XCTAssertEqual(seen.insets?.top ?? -1, rotated.top, accuracy: 0.5, "rotation : les marges se republient")
        XCTAssertEqual(seen.insets?.bottom ?? -1, rotated.bottom, accuracy: 0.5)
        XCTAssertNotEqual(rotated.top, truth.top, "précondition : les marges ont bien changé")
    }

    func test_resolveInsets_keepsAMeasuredZero() {
        let fallback = EdgeInsets(top: 59, leading: 0, bottom: 34, trailing: 0)
        XCTAssertEqual(SceneWindowSize.resolveInsets(EdgeInsets(), fallback: fallback), EdgeInsets(), "une marge nulle est une mesure")
        XCTAssertEqual(SceneWindowSize.resolveInsets(nil, fallback: fallback), fallback)
    }
}
