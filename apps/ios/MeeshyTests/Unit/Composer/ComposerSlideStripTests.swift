import XCTest
@testable import Meeshy

/// **L'atelier dit combien de slides il porte** (constat porteur 2026-09-06).
///
/// Mesuré au simulateur : le `[+]` du rail droit crée bien une slide, et rien
/// à l'écran ne le dit — pas de compteur, pas de rang, aucun retour vers la
/// slide précédente. J'ai dû PUBLIER pour découvrir ce que le composer
/// portait.
///
/// > Une action dont on ne voit pas l'effet n'est pas une action, c'est un
/// > pari. Le bouton fait exactement ce qu'il promet ; son résultat n'a
/// > simplement aucun témoin visible, ce qui revient au même pour qui compose.
final class ComposerSlideStripTests: XCTestCase {

    /// **Une pellicule d'un élément n'est pas une pellicule** — même règle que
    /// la mosaïque. À une seule slide, il n'y a ni compte à donner ni rang à
    /// désigner.
    func test_uneSeuleSlide_neSertAucuneBande() {
        XCTAssertFalse(ComposerSlideStrip.isServed(slideCount: 1))
        XCTAssertFalse(ComposerSlideStrip.isServed(slideCount: 0))
    }

    /// Dès la DEUXIÈME, la bande paraît : c'est l'instant précis où l'auteur
    /// perd de vue ce qu'il compose.
    func test_desLaDeuxiemeSlide_laBandeParait() {
        XCTAssertTrue(ComposerSlideStrip.isServed(slideCount: 2))
        XCTAssertTrue(ComposerSlideStrip.isServed(slideCount: 10))
    }

    /// **Le libellé porte le RANG et le TOTAL.** « Slide 2 » seul laisserait
    /// VoiceOver sans le compte — l'information même qui manquait à l'œil.
    func test_leLibelle_diteRangEtTotal() {
        XCTAssertEqual(ComposerSlideStrip.libelle(index: 1, total: 3), "Slide 2 sur 3")
        XCTAssertEqual(ComposerSlideStrip.libelle(index: 0, total: 2), "Slide 1 sur 2")
    }
}
