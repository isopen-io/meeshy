import XCTest
import CoreGraphics
@testable import Meeshy
@testable import MeeshyUI

/// **Les rails s'ancrent au bas du DESSIN, pas au bas de la frame** (#4119).
///
/// La carte est figée à son ratio et se CENTRE dans la hauteur qu'on lui donne
/// (`EmbeddedSceneCanvas` : `frame(maxHeight: .infinity)` puis `aspectFitSize`).
/// Un `.overlay(alignment: .bottom…)` tombait donc au bas de la FRAME — sous la
/// composition, d'un écart qui vaut la moitié de la hauteur perdue.
///
/// > L'écart n'est pas constant : il vaut zéro quand la carte remplit la
/// > hauteur, et il grandit avec le ratio jusqu'à poser les portes en face de
/// > rien. C'est ce qui rend le défaut invisible sur l'appareil de
/// > développement et flagrant en paysage.
final class ComposerRailBottomAnchorTests: XCTestCase {

    /// L'encastrement réel du composer — lu de la règle, jamais recopié : un
    /// littéral ici rendrait la mesure fausse le jour où le couloir change,
    /// sans que rien ne rougisse.
    private var couloir: CGFloat { ComposerRailGeometry.sceneInset(railsShown: true) }

    /// **Le cas nominal, chiffré.** iPhone 16 Pro (402 pt), une zone de 700 pt
    /// de haut, une carte 9:16 : elle occupe 278 pt de large — la largeur que
    /// les deux couloirs lui laissent — donc 494 pt de haut. Il reste 206 pt de
    /// vide, moitié en haut, moitié en bas.
    func test_uneCarteQuiNeRemplitPasLaHauteur_laisseLaMoitieEnBas() {
        let inset = ComposerRailGeometry.sceneBottomInset(
            overlay: CGSize(width: 402, height: 700),
            ratio: CanvasGeometry.portraitRatio,
            horizontalInset: couloir)
        let largeurCarte = 402 - 2 * couloir
        let hauteurDessin = largeurCarte / CanvasGeometry.portraitRatio
        XCTAssertEqual(inset, (700 - hauteurDessin) / 2, accuracy: 0.01)
        XCTAssertGreaterThan(inset, 20, "l'écart mesuré à l'écran était d'environ 25 pt")
    }

    /// **Zéro quand la carte remplit la hauteur.** C'est le cas où le défaut ne
    /// se voyait pas — et la raison pour laquelle il a survécu à plusieurs
    /// vérifications visuelles.
    func test_uneCarteQuiRemplitLaHauteur_neLaisseRien() {
        let largeurCarte: CGFloat = 278
        let hauteur = largeurCarte / CanvasGeometry.portraitRatio
        let inset = ComposerRailGeometry.sceneBottomInset(
            overlay: CGSize(width: largeurCarte + 2 * couloir, height: hauteur),
            ratio: CanvasGeometry.portraitRatio,
            horizontalInset: couloir)
        XCTAssertEqual(inset, 0, accuracy: 0.01)
    }

    /// **L'écart GRANDIT avec le ratio** — c'est l'affirmation entière de
    /// l'issue. Un correctif qui poserait une constante serait juste en
    /// portrait et faux partout ailleurs ; celui-ci suit le ratio, que la vue
    /// connaît déjà.
    func test_lEcart_grandiTAvecLeRatio() {
        let zone = CGSize(width: 402, height: 700)
        let portrait = ComposerRailGeometry.sceneBottomInset(
            overlay: zone, ratio: CanvasGeometry.portraitRatio, horizontalInset: couloir)
        let carre = ComposerRailGeometry.sceneBottomInset(
            overlay: zone, ratio: 1, horizontalInset: couloir)
        let paysage = ComposerRailGeometry.sceneBottomInset(
            overlay: zone, ratio: 16.0 / 9.0, horizontalInset: couloir)
        XCTAssertLessThan(portrait, carre)
        XCTAssertLessThan(carre, paysage)
        XCTAssertGreaterThan(paysage, 250,
                             "en paysage, les portes se retrouveraient en face de rien")
    }

    /// **Les COULOIRS sont retirés, et c'est ce qui distingue une mesure juste
    /// d'une mesure juste par accident.**
    ///
    /// L'overlay se pose sur la vue PADDÉE : sa largeur inclut les deux
    /// couloirs, que la carte n'occupe pas. Calculer le `fit` sans les retirer
    /// donnerait une carte plus large, donc plus haute, donc un inset trop
    /// petit — un rail qui remonterait au lieu de descendre, et une erreur qui
    /// se réduit quand la hauteur est contrainte par la largeur.
    func test_lesCouloirs_sontRetiresDeLaLargeurDeLaCarte() {
        let zone = CGSize(width: 402, height: 700)
        let avec = ComposerRailGeometry.sceneBottomInset(
            overlay: zone, ratio: CanvasGeometry.portraitRatio, horizontalInset: couloir)
        let sans = ComposerRailGeometry.sceneBottomInset(
            overlay: zone, ratio: CanvasGeometry.portraitRatio, horizontalInset: 0)
        XCTAssertGreaterThan(avec, sans,
                             "une carte plus étroite est plus courte, donc laisse plus de vide")
    }

    /// **Jamais négatif.** Une zone plus étroite que les deux couloirs rendrait,
    /// passée telle quelle, un inset qui remonterait le rail hors du cadre —
    /// un écran silencieusement faux plutôt qu'un rail mal placé.
    func test_uneZoneDegeneree_neRendJamaisUnInsetNegatif() {
        for zone in [CGSize(width: 10, height: 700),
                     CGSize(width: 0, height: 0),
                     CGSize(width: 402, height: 0)] {
            XCTAssertGreaterThanOrEqual(
                ComposerRailGeometry.sceneBottomInset(
                    overlay: zone, ratio: CanvasGeometry.portraitRatio, horizontalInset: couloir),
                0, "\(zone)")
        }
    }

    /// **Et les DEUX rails passent par là.** Un correctif appliqué à un seul
    /// laisserait les deux rails à deux hauteurs différentes autour de la même
    /// scène — ce qui se voit avant de se comprendre.
    func test_lesDeuxRails_sontAncresParLaMemeFonction() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerSceneSurface.swift")
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        XCTAssertTrue(source.contains("func ancreAuDessin<Contenu: View>("),
                      "une seule fonction d'ancrage, générique sur le contenu")
        XCTAssertEqual(source.components(separatedBy: "ancreAuDessin(").count - 1, 2,
                       "les deux montages — leading et trailing — l'appellent")
        XCTAssertTrue(source.contains("alignment: .bottomLeading)"))
        XCTAssertTrue(source.contains("alignment: .bottomTrailing"))
    }
}
