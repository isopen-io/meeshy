import XCTest
import SwiftUI
@testable import MeeshySDK
@testable import MeeshyUI

/// **Le sol d'une scène ne DICTE pas la taille de son hôte** (#7037).
///
/// `scaledToFill()` rend une vue qui REMPLIT la proposition : au moins une
/// dimension déborde, et c'est cette taille débordante que la vue ANNONCE à son
/// parent. Posée nue, l'empreinte d'une scène large annonçait 874 × 1,24 =
/// 1082,7 pt ; le `ZStack` du plein écran adoptait cette largeur et se centrait,
/// bord gauche à (402 − 1082,7) / 2 = −340,3. Le bouton « Fermer », aligné sur
/// ce bord au pas du couloir (14 pt), tombait à −326,3 — **entièrement hors de
/// l'écran**, et la pièce jointe d'un post ne se fermait plus qu'au geste.
///
/// Le témoin mesure ce que la vue ANNONCE, parce que c'est la seule chose que le
/// défaut changeait : à l'écran, l'image remplissait déjà correctement avant
/// comme après. Un témoin de pixels serait resté vert tout du long.
final class SceneFloorSizingTests: XCTestCase {

    /// Une empreinte VALIDE, donc décodée : sans elle la vue serait vide et le
    /// témoin passerait pour la mauvaise raison. Ce hash est celui qu'emploie
    /// déjà `StoryDraftStoreTests`.
    private let thumbHash = "1QcSHQRnh493V4dIh4eXh0h4kJUI"

    private func annoncee(_ proposee: CGSize) -> CGSize {
        let hote = UIHostingController(
            rootView: SceneFloorView(thumbHash: thumbHash, veil: SceneFloorView.cardedVeil)
        )
        return hote.sizeThatFits(in: proposee)
    }

    func test_leDecodageDeLEmpreinteReussit_sansQuoiLeTemoinNeMesureRien() {
        XCTAssertNotNil(UIImage.fromThumbHash(thumbHash),
                        "Sans image décodée, la vue est vide et ne peut pas déborder : le témoin serait vert par omission.")
    }

    func test_leSol_neDepasseJamaisLaLargeurProposee() {
        let proposee = CGSize(width: 402, height: 874)   // iPhone 16 Pro, points
        let rendue = annoncee(proposee)

        XCTAssertLessThanOrEqual(
            rendue.width, proposee.width,
            """
            Le sol annonce \(rendue.width) pt de large pour \(proposee.width) proposés. \
            Son hôte adoptera cette largeur et se centrera : tout ce qui s'aligne sur \
            son bord gauche sortira de l'écran — c'est le défaut #7037, où « Fermer » \
            tombait à −326,3 pt.
            """
        )
        XCTAssertLessThanOrEqual(
            rendue.height, proposee.height,
            "Le sol annonce \(rendue.height) pt de haut pour \(proposee.height) proposés — même défaut sur l'autre axe."
        )
    }

    func test_leSol_neDepassePas_surUneProposiitionCarree() {
        let proposee = CGSize(width: 500, height: 500)
        let rendue = annoncee(proposee)

        XCTAssertLessThanOrEqual(rendue.width, proposee.width,
                                 "Une proposition carrée ne doit pas non plus être débordée.")
        XCTAssertLessThanOrEqual(rendue.height, proposee.height,
                                 "Une proposition carrée ne doit pas non plus être débordée.")
    }

    func test_leSol_remplitBienLaPlaceProposee_ilNeSeRetracePasNonPlus() {
        let proposee = CGSize(width: 402, height: 874)
        let rendue = annoncee(proposee)

        XCTAssertEqual(rendue.width, proposee.width, accuracy: 0.5,
                       "Le sol doit PRENDRE la largeur proposée — le borner ne doit pas le rétrécir.")
        XCTAssertEqual(rendue.height, proposee.height, accuracy: 0.5,
                       "Le sol doit PRENDRE la hauteur proposée — le borner ne doit pas le rétrécir.")
    }
}
