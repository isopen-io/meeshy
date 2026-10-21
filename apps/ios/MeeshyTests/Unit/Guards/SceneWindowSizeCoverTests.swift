import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// Le viewer de story, les galeries, le plein écran audio et le composer vivent dans des `fullScreenCover`. Le dépôt
/// note par endroits qu'un cover « n'hérite pas » de l'environnement de son hôte (`RootViewLayers`,
/// `SocialMediaGalleryPresentation` : vrai des `EnvironmentObject` qu'ils remettent à la main). Pour les VALEURS
/// d'environnement publiées par la racine de la fenêtre (`\.sceneWindowSize`, `\.sceneSafeAreaInsets`), mesuré au
/// cycle 9 sur iOS 17.5 et 26.1 : l'intérieur du cover les reçoit. Ce témoin le verrouille — s'il rougissait un jour,
/// les lectures migrées aux cycles 7 et 8 retomberaient en silence sur la fenêtre clé dans tous les plein écrans.
@MainActor
final class SceneWindowSizeCoverTests: XCTestCase {

    private final class Seen { var size: CGSize? }

    private struct Probe: View {
        let seen: Seen
        @Environment(\.sceneWindowSize) private var size
        var body: some View {
            Text("sonde").accessibilityLabel("sonde")
                .onAppear { seen.size = size }.onChange(of: size) { seen.size = $0 }
        }
    }

    private struct CoverHost: View {
        let seen: Seen
        @State private var shown = false
        var body: some View {
            // La racine REMPLIT sa fenêtre, comme celles de MeeshyApp : c'est la fenêtre qu'elle publie.
            Text("hôte")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .onAppear { shown = true }
                .fullScreenCover(isPresented: $shown) { Probe(seen: seen) }
                .publishingSceneWindowSize()
        }
    }

    func test_aCover_readsTheWindowPublishedByItsHost() {
        let seen = Seen()
        let screen = RenderedScreen(CoverHost(seen: seen), size: CGSize(width: 320, height: 700))
        defer { screen.dismount() }
        RunLoop.main.run(until: Date().addingTimeInterval(1.0))

        XCTAssertEqual(seen.size?.width ?? 0, 320, accuracy: 0.5, "le plein écran lit la largeur de SA fenêtre")
        XCTAssertEqual(seen.size?.height ?? 0, 700, accuracy: 0.5)
    }
}
