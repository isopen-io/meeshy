import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **Une tuile de la rangée haute dit le FOND d'une slide, et rien d'autre** (#4724).
///
/// > Directive porteur 2026-09-01 : « faire la différence entre les medias sur la
/// > scene en foreground et les media en background (apparaissent comme nouveau
/// > tuile en haut sur la rangé des headers) […] le comportement actuel qui fait
/// > que lorsqu'on ajoute n'importe quel média ça vient [dans] la trail des
/// > slides doit être supprimé ! »
///
/// Le témoin s'écrit sur les cas que la STRUCTURE rate. Alimentée par
/// `documentLocalMedia`, la rangée rendait le MÊME écran pour un fond et pour un
/// premier plan : le seul rang où l'ancien défaut était invisible est celui d'un
/// document qui n'a qu'un fond — et c'est exactement le cas nominal.
final class ComposerMediaPlacementTests: XCTestCase {

    private func media(_ nom: String, mime: String = "image/jpeg") -> ComposerDocumentMedia {
        ComposerDocumentMediaFactory.media(
            url: URL(fileURLWithPath: "/tmp/\(nom)"), declaredMimeType: mime)
    }

    private func url(_ nom: String) -> URL { URL(fileURLWithPath: "/tmp/\(nom)") }

    // MARK: - Par quelle porte, sur quelle scène

    /// **La rangée du document fonde une page, même quand une scène existe.**
    /// C'est le cas qu'une règle résumée à « il y a déjà un fond ⇒ premier plan »
    /// raterait : elle ferait disparaître le carrousel dès la seconde photo.
    func test_laRangeeDuDocument_fondeUnePage_memeSurUneSceneDejaFondee() {
        XCTAssertEqual(
            ComposerMediaPlacement.role(door: .documentRow, currentSlideHasBackground: true),
            .background)
    }

    func test_laRangeeDuDocument_fondeUnePage_surUnDocumentVierge() {
        XCTAssertEqual(
            ComposerMediaPlacement.role(door: .documentRow, currentSlideHasBackground: false),
            .background)
    }

    /// **LE cas du lot** : la porte du rail pose SUR la scène, elle n'ouvre pas
    /// de page.
    func test_leRailPose_enPremierPlan_quandLaSceneAUnFond() {
        XCTAssertEqual(
            ComposerMediaPlacement.role(door: .sceneRail, currentSlideHasBackground: true),
            .foreground)
    }

    /// **La moitié qu'on oublie en résumant la règle.** Une slide vierge n'a pas
    /// de fond : le premier média posé le DEVIENT, `addMediaObject` l'y range de
    /// lui-même. Déclarer « premier plan » ici ferait dire à la rangée haute le
    /// contraire de ce que le modèle écrit.
    func test_leRailFondeLeFond_quandLaSlideEstVierge() {
        XCTAssertEqual(
            ComposerMediaPlacement.role(door: .sceneRail, currentSlideHasBackground: false),
            .background,
            "un rôle déclaré à l'entrée doit être celui que le modèle écrira à la sortie")
    }

    // MARK: - Ce qui gagne une tuile

    /// **Le témoin s'écrit à DEUX médias.** À un seul, « toutes les tuiles » et
    /// « les tuiles des fonds » rendent le même écran.
    func test_unMediaDePremierPlan_nAPasDeTuile() {
        let fond = media("fond.jpg"), pose = media("pose.jpg")
        let tuiles = ComposerHeaderTiles.tiles([fond, pose],
                                               founding: [url("fond.jpg"): "slide-1"])
        XCTAssertEqual(tuiles.map(\.url.lastPathComponent), ["fond.jpg"])
    }

    /// **Un SON n'a pas de tuile** — il n'a pas de place de fond visuel, et sa
    /// carte le dit déjà sous le texte. Il vivait pourtant dans la rangée haute,
    /// parce qu'elle lisait `documentLocalMedia` sans rien demander.
    func test_unSon_nApparaitPasDansLaRangeeHaute() {
        let fond = media("fond.jpg"), son = media("voix.m4a", mime: "audio/mp4")
        let tuiles = ComposerHeaderTiles.tiles([fond, son],
                                               founding: [url("fond.jpg"): "slide-1"])
        XCTAssertEqual(tuiles.map(\.url.lastPathComponent), ["fond.jpg"])
    }

    /// Un DOCUMENT part en pièce jointe et n'est aucune page.
    func test_unDocument_nApparaitPasDansLaRangeeHaute() {
        let pdf = media("contrat.pdf", mime: "application/pdf")
        XCTAssertTrue(ComposerHeaderTiles.tiles([pdf], founding: [:]).isEmpty)
    }

    /// **L'ordre est celui de la POSE**, jamais celui des slides : c'est le seul
    /// que l'auteur puisse prévoir, et le retrait d'un média au milieu fait
    /// mentir tout ordre reconstruit.
    func test_lOrdreDesTuiles_estCeluiDeLaPose() {
        let a = media("a.jpg"), b = media("b.jpg"), c = media("c.jpg")
        let tuiles = ComposerHeaderTiles.tiles([a, b, c],
                                               founding: [url("c.jpg"): "s3", url("a.jpg"): "s1"])
        XCTAssertEqual(tuiles.map(\.url.lastPathComponent), ["a.jpg", "c.jpg"])
    }

    /// Aucune fondation ⇒ aucune tuile. Pas une rangée à hauteur nulle, pas une
    /// tuile par défaut : un document dont rien n'a fondé de page n'a pas de
    /// carrousel à montrer (loi 4).
    func test_sansFondation_laRangeeEstVide() {
        XCTAssertTrue(ComposerHeaderTiles.tiles([media("a.jpg"), media("b.jpg")],
                                                founding: [:]).isEmpty)
    }
}
