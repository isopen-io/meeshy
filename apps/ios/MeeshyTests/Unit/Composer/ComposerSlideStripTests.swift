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
    ///
    /// Le témoin éprouve les DEUX NOMBRES ET LEUR ORDRE, jamais la langue :
    /// `libelle` traverse le catalogue, donc son texte suit la locale du
    /// simulateur. Épingler « Slide 2 sur 3 » ne passait que tant que la clé
    /// était ABSENTE du catalogue — le `defaultValue` français sortait alors
    /// pour tout le monde, y compris sur un runner anglophone. Le jour où la
    /// clé a reçu ses sept traductions (leçon 542), l'assertion est tombée sur
    /// « Slide 2 of 3 » : elle mesurait la lacune de traduction, pas le
    /// libellé.
    ///
    /// L'ordre compte autant que la présence : `composer.slide.strip.position`
    /// passe par `String(format:)` avec `%1$d`/`%2$d`, et une traduction qui
    /// perdrait ses ordinaux annoncerait « la slide 3 sur 2 ».
    func test_leLibelle_diteRangEtTotal() {
        let libelle = ComposerSlideStrip.libelle(index: 1, total: 3)
        guard let rang = libelle.range(of: "2"), let total = libelle.range(of: "3") else {
            return XCTFail("le libellé ne porte pas ses deux nombres : \(libelle)")
        }
        XCTAssertTrue(rang.lowerBound < total.lowerBound,
                      "le RANG doit précéder le TOTAL, sans quoi « 3 sur 2 » : \(libelle)")

        let premier = ComposerSlideStrip.libelle(index: 0, total: 2)
        XCTAssertTrue(premier.contains("1") && premier.contains("2"),
                      "le libellé de la première slide doit porter rang ET total : \(premier)")
    }
}
