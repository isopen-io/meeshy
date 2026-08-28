import XCTest
import SwiftUI
@testable import Meeshy

/// #4061 + #4062 — **la preuve que le rail tombe DANS le couloir réservé, et
/// non sur la scène.**
///
/// ## Pourquoi cette suite plutôt qu'une capture d'écran
///
/// Le critère de fin des deux issues dit « rien ne recouvre jamais la
/// composition ». Une capture le montrerait à l'œil ; ces témoins le
/// MESURENT — et sur le point précis où l'intuition peut se tromper.
///
/// Le montage repose sur une sémantique SwiftUI qu'il faut vérifier plutôt que
/// supposer : **une surimpression posée sur une vue DÉJÀ encastrée hérite du
/// repère de la vue encastrée, couloir compris.** Si c'était faux —
/// si `.overlay` s'alignait sur le contenu et non sur la vue paddée — le rail
/// tomberait SUR la scène, exactement ce que la loi 6 interdit, et aucune
/// garde de source ne le dirait.
///
/// Le harnais rend donc la composition réelle dans un `UIHostingController` à
/// une taille connue, puis compare les rectangles. La mesure, à 402 pt utiles :
///
///     scene  x = 62,  largeur 278     ← commence APRÈS le couloir
///     rail   x = 10 → 54, largeur 44  ← marge de bord, puis 8 pt de gouttière
///
/// ## Deux conditions du harnais, apprises en le construisant
///
/// **Un marqueur doit être une vraie `UIView`.** La première version posait
/// `.accessibilityIdentifier` sur un `Color` SwiftUI : une couleur est rendue
/// en COUCHE, pas en vue, et l'arbre parcouru était muet.
///
/// **L'hôte doit vivre dans une FENÊTRE.** Hors fenêtre, il ne matérialise pas
/// ses `UIViewRepresentable` : les marqueurs n'existaient tout simplement pas.
///
/// Les deux fois, c'est le FUSIBLE qui l'a dit — sans lui, un harnais qui ne
/// rend rien serait passé pour une preuve.
@MainActor
final class ComposerRailMountGeometryTests: XCTestCase {

    /// La composition MINIMALE du montage réel : un contenu encastré des deux
    /// couloirs, surmonté du rail en `.bottomLeading`. Les deux marqueurs
    /// portent une `accessibilityIdentifier` pour être retrouvés dans l'arbre
    /// de vues rendu.
    /// **Un marqueur UIKit RÉEL, et c'est nécessaire.** La première version de
    /// ce harnais posait `.accessibilityIdentifier` sur un `Color` SwiftUI :
    /// SwiftUI rend une couleur en COUCHE, pas en `UIView`, si bien qu'aucun
    /// marqueur n'existait dans l'arbre. Le fusible l'a attrapé — sans lui, un
    /// harnais qui ne rend rien aurait pu passer pour une preuve.
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

    private struct Harness: View {
        let usableWidth: CGFloat
        var body: some View {
            Marker(identifier: "scene")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.horizontal, ComposerRailGeometry.sceneInset(railsShown: true))
                .overlay(alignment: .bottomLeading) {
                    Marker(identifier: "rail")
                        .frame(width: ComposerRailGeometry.railWidth, height: 200)
                        .padding(.leading, ComposerRailGeometry.outerMargin)
                        .padding(.bottom, ComposerRailGeometry.gutter)
                }
                .frame(width: usableWidth, height: 700)
        }
    }

    /// **La fenêtre n'est pas une précaution, c'est une condition.** Hors
    /// fenêtre, `UIHostingController` ne matérialise pas toute sa hiérarchie :
    /// les `UIViewRepresentable` peuvent n'être jamais créés, et l'arbre qu'on
    /// parcourt est alors muet — vert par omission garanti.
    private var window: UIWindow?

    private func render(width: CGFloat) -> UIView {
        let host = UIHostingController(rootView: Harness(usableWidth: width))
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: width, height: 700))
        window.rootViewController = host
        window.isHidden = false
        window.makeKeyAndVisible()
        self.window = window
        host.view.frame = CGRect(x: 0, y: 0, width: width, height: 700)
        window.setNeedsLayout()
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

    /// **Le témoin central.** Les deux rectangles ne doivent pas se croiser
    /// d'un seul point.
    func test_leRail_neRecouvreAucunPixelDeLaScene() throws {
        let root = render(width: 402)
        let scene = try XCTUnwrap(frame("scene", in: root), "scène introuvable dans l'arbre rendu")
        let rail = try XCTUnwrap(frame("rail", in: root), "rail introuvable dans l'arbre rendu")

        XCTAssertFalse(scene.intersects(rail),
                       "Le rail chevauche la scène — scène \(scene), rail \(rail).")
    }

    /// Le rail est DANS le couloir : son bord *trailing* s'arrête avant le bord
    /// *leading* de la scène, à la gouttière près.
    func test_leRail_tientEntierementDansLeCouloir() throws {
        let root = render(width: 402)
        let scene = try XCTUnwrap(frame("scene", in: root))
        let rail = try XCTUnwrap(frame("rail", in: root))

        XCTAssertEqual(rail.minX, ComposerRailGeometry.outerMargin, accuracy: 0.5,
                       "Le rail doit commencer à la marge de bord.")
        XCTAssertEqual(scene.minX, ComposerRailGeometry.lane, accuracy: 0.5,
                       "La scène doit commencer après le couloir entier.")
        XCTAssertLessThanOrEqual(rail.maxX, scene.minX,
                                 "Le rail déborde dans la scène.")
    }

    /// La scène occupe bien la largeur que la règle annonce — le lien entre
    /// l'arithmétique de #4061 et le rendu réel.
    func test_laLargeurRendue_estCelleQueLaRegleAnnonce() throws {
        for utile in [375.0, 402.0, 430.0] as [CGFloat] {
            let root = render(width: utile)
            let scene = try XCTUnwrap(frame("scene", in: root), "utile \(utile)")
            XCTAssertEqual(scene.width,
                           ComposerRailGeometry.sceneWidth(usableWidth: utile, railsShown: true),
                           accuracy: 0.5,
                           "utile \(utile) : le rendu s'écarte de la règle.")
        }
    }

    /// **Le fusible.** Si le harnais cessait de rendre quoi que ce soit, les
    /// trois témoins ci-dessus deviendraient verts par omission — un
    /// `XCTUnwrap` sur un arbre vide échouerait, mais un arbre à UNE vue
    /// passerait sans rien prouver.
    func test_leHarnais_rendBienLesDeuxMarqueurs() throws {
        let root = render(width: 402)
        XCTAssertNotNil(frame("scene", in: root))
        XCTAssertNotNil(frame("rail", in: root))
    }
}
