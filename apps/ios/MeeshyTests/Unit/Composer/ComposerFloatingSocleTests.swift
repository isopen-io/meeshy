import XCTest
import SwiftUI
@testable import Meeshy

/// **Le socle FLOTTE au bas de la scène, et il réserve sa hauteur** (#8370,
/// lot 2 de la maquette plein écran).
///
/// Il était le frère de la surface dans une `VStack` : une bande opaque qui
/// coupait l'écran en deux. Il se pose désormais en surimpression — le fond de
/// la scène passe dessous — et la surface lui cède sa hauteur, si bien que la
/// rangée d'outils du bas reste entière au-dessus de lui.
///
/// Le témoin est un rendu UIKit réel, comme `ComposerRailMountGeometryTests` :
/// la propriété se lit au pixel, jamais dans le texte d'un modificateur.
@MainActor
final class ComposerFloatingSocleTests: XCTestCase {

    private struct Marker: UIViewRepresentable {
        let identifier: String
        func makeUIView(context: Context) -> UIView {
            let view = UIView()
            view.accessibilityIdentifier = identifier
            view.isUserInteractionEnabled = false
            return view
        }
        func updateUIView(_ uiView: UIView, context: Context) {
            uiView.accessibilityIdentifier = identifier
        }
    }

    private static let socleHeight: CGFloat = 60
    private static let lowRowHeight: CGFloat = 56

    private struct Harness: View {
        let showsSocle: Bool
        var body: some View {
            VStack(spacing: 0) {
                Marker(identifier: "scene")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                Marker(identifier: "lowRow")
                    .frame(maxWidth: .infinity)
                    .frame(height: ComposerFloatingSocleTests.lowRowHeight)
            }
            .composerFloatingSocle {
                if showsSocle {
                    Marker(identifier: "socle")
                        .frame(maxWidth: .infinity)
                        .frame(height: ComposerFloatingSocleTests.socleHeight)
                }
            }
            .background(Marker(identifier: "backdrop").ignoresSafeArea())
            .frame(width: 402, height: 800)
        }
    }

    private var window: UIWindow?

    private func render(showsSocle: Bool = true) -> UIView {
        let host = UIHostingController(rootView: Harness(showsSocle: showsSocle))
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 800))
        window.rootViewController = host
        window.isHidden = false
        window.makeKeyAndVisible()
        self.window = window
        host.view.frame = CGRect(x: 0, y: 0, width: 402, height: 800)
        window.layoutIfNeeded()
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        return host.view
    }

    override func tearDown() {
        window?.rootViewController = nil
        window?.isHidden = true
        window = nil
        super.tearDown()
    }

    private func frame(_ identifier: String, in root: UIView) -> CGRect? {
        if root.accessibilityIdentifier == identifier {
            return root.convert(root.bounds, to: nil)
        }
        for sub in root.subviews {
            if let found = frame(identifier, in: sub) { return found }
        }
        return nil
    }

    func test_laRangeeBasse_finitAuDessusDuSocle() throws {
        let root = render()
        let lowRow = try XCTUnwrap(frame("lowRow", in: root), "rangée basse introuvable")
        let socle = try XCTUnwrap(frame("socle", in: root), "socle introuvable")

        XCTAssertLessThanOrEqual(lowRow.maxY, socle.minY + 0.5,
                                 "Le socle recouvre la rangée d'outils : rangée \(lowRow), socle \(socle).")
        XCTAssertEqual(socle.height, Self.socleHeight, accuracy: 0.5)
    }

    func test_leSocle_flotteSurLeFondDeLaScene() throws {
        let root = render()
        let backdrop = try XCTUnwrap(frame("backdrop", in: root), "fond introuvable")
        let socle = try XCTUnwrap(frame("socle", in: root))

        XCTAssertTrue(backdrop.contains(socle),
                      "Le fond de la scène doit passer SOUS le socle — fond \(backdrop), socle \(socle).")
    }

    func test_sansSocle_laSurfaceGardeToutLeBas() throws {
        let avecSocle = try XCTUnwrap(frame("lowRow", in: render(showsSocle: true)))
        let root = render(showsSocle: false)
        let sansSocle = try XCTUnwrap(frame("lowRow", in: root))

        XCTAssertNil(frame("socle", in: root))
        XCTAssertEqual(sansSocle.maxY - avecSocle.maxY, Self.socleHeight, accuracy: 0.5,
                       "Sans socle, aucune hauteur ne doit rester réservée.")
    }
}
