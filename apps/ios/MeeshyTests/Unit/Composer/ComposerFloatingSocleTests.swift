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
        let size: CGSize
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
            .frame(width: size.width, height: size.height)
        }
    }

    private var window: UIWindow?

    /// L'iPhone 16 Pro et l'iPad (10e génération) en portrait : l'encart ne
    /// dépend pas de la taille, et le témoin le vérifie sur les deux cibles.
    private static let iPhone = CGSize(width: 402, height: 800)
    private static let iPad = CGSize(width: 820, height: 1180)

    private func render(showsSocle: Bool = true, size: CGSize = iPhone) -> UIView {
        let host = UIHostingController(rootView: Harness(showsSocle: showsSocle, size: size))
        let window = UIWindow(frame: CGRect(origin: .zero, size: size))
        window.rootViewController = host
        window.isHidden = false
        window.makeKeyAndVisible()
        self.window = window
        host.view.frame = CGRect(origin: .zero, size: size)
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
        for size in [Self.iPhone, Self.iPad] {
            let root = render(size: size)
            let lowRow = try XCTUnwrap(frame("lowRow", in: root), "\(size) : rangée basse introuvable")
            let socle = try XCTUnwrap(frame("socle", in: root), "\(size) : socle introuvable")

            XCTAssertLessThanOrEqual(lowRow.maxY, socle.minY + 0.5,
                                     "\(size) : le socle recouvre la rangée d'outils — rangée \(lowRow), socle \(socle).")
            XCTAssertEqual(socle.height, Self.socleHeight, accuracy: 0.5, "\(size)")
        }
    }

    func test_leSocle_flotteSurLeFondDeLaScene() throws {
        for size in [Self.iPhone, Self.iPad] {
            let root = render(size: size)
            let backdrop = try XCTUnwrap(frame("backdrop", in: root), "\(size) : fond introuvable")
            let socle = try XCTUnwrap(frame("socle", in: root), "\(size)")

            XCTAssertTrue(backdrop.contains(socle),
                          "\(size) : le fond de la scène doit passer SOUS le socle — fond \(backdrop), socle \(socle).")
        }
    }

    func test_sansSocle_laSurfaceGardeToutLeBas() throws {
        let avecSocle = try XCTUnwrap(frame("lowRow", in: render(showsSocle: true)))
        let root = render(showsSocle: false)
        let sansSocle = try XCTUnwrap(frame("lowRow", in: root))

        XCTAssertNil(frame("socle", in: root))
        XCTAssertEqual(sansSocle.maxY - avecSocle.maxY, Self.socleHeight, accuracy: 0.5,
                       "Sans socle, aucune hauteur ne doit rester réservée.")
    }

    /// **Le verre du socle est TEINTÉ du plateau.** Nu, le Liquid Glass d'iOS 26
    /// choisit seul sa luminance : mesuré au simulateur le 2026-09-27, la
    /// pastille d'audience est devenue un verre CLAIR sous un libellé blanc,
    /// illisible. La teinte du plateau le tient sombre, comme les rails, et
    /// garde vraie la composition que mesurent les témoins de contraste
    /// (`ComposerPlateauTests`) — la même raison que la directive porteur du
    /// 2026-09-05 sur la bande de mentions.
    func test_leVerreDuSocle_estTeinteDuPlateau() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(code.contains("varsocle:someView"), "Source du socle introuvable — la garde ne mesurerait rien.")
        XCTAssertTrue(code.contains(".adaptiveGlass(in:Capsule(),tint:tint.color.opacity(0.55))"),
                      "L'audience doit porter un verre teinté du plateau.")
        XCTAssertTrue(code.contains(".adaptiveGlass(in:Circle(),tint:tint.color.opacity(0.55))"),
                      "L'œil doit porter un verre teinté du plateau.")
        XCTAssertFalse(code.contains(".adaptiveGlass(in:Capsule())"),
                       "Un verre nu dans le socle choisit seul sa luminance, et le libellé blanc s'y perd.")
    }

    /// **La barre haute flotte AUSSI sur la scène** : sa croix et son `⋯`
    /// portent le même verre teinté, sinon ils virent au clair sur une photo
    /// claire et leurs glyphes blancs disparaissent (simulateur, 2026-09-27).
    func test_leVerreDeLaBarreHaute_estTeinteDuPlateau() throws {
        let barre = AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Main/Composer/ComposerTopBar.swift"))
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(barre.contains(".adaptiveGlass(in:Circle(),tint:plateauTint.opacity(0.55))"),
                      "La croix doit porter un verre teinté du plateau.")
        let hote = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertFalse(hote.contains(".adaptiveGlass(in:Circle())"),
                       "Aucun verre nu dans le chrome du meuble : le `⋯` est teinté comme la croix.")
    }
}
