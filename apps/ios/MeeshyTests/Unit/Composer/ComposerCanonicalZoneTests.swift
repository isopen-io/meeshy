import XCTest
@testable import Meeshy

/// #5010 — **les options d'un outil ont le bas pour elles seules.**
///
/// > « lorsqu'on affiche les options d'un outil il faut cacher les éléments
/// > permanents de la zone canonique pour afficher ces outils ! »
/// > — porteur, 2026-09-03
///
/// ## Ce que ces témoins gardent, et qui n'est pas la condition
///
/// `!toolIsOpen` est trivial. Ce qui ne l'est pas est l'INVENTAIRE : deux des
/// quatre éléments du bas n'étaient gouvernés par personne, et rien ne
/// rougissait — une rangée non gouvernée ressemble en tout à une rangée
/// gouvernée qui se trouve servie.
///
/// Le témoin porte donc sur la COMPLÉTUDE de l'énumération, pas sur le calcul.
final class ComposerCanonicalZoneTests: XCTestCase {

    /// **Tout élément déclaré est gouverné.** C'est la règle 1 : un élément
    /// qu'on ajoute à la zone doit dire s'il cède la place, et le `switch`
    /// exhaustif de `yieldsToTool` l'y oblige à la compilation. Ce témoin
    /// vérifie qu'aucun ne répond « oui » à l'ouverture d'un outil sans avoir
    /// été interrogé.
    func test_chaqueÉlémentDeLaZone_répondÀLOuvertureDUnOutil() {
        for élément in ComposerCanonicalZone.Element.allCases {
            XCTAssertTrue(
                ComposerCanonicalZone.isServed(élément, toolIsOpen: false),
                "\(élément) doit être peint hors outil — sinon il n'appartient pas à cette zone"
            )
        }
    }

    /// **Les deux cèdent aujourd'hui.** Le jour où un élément ne cédera pas, il
    /// devra le dire dans `yieldsToTool` avec sa raison — et ce témoin le fera
    /// rougir, ce qui est exactement le moment où on veut relire la décision.
    func test_unOutilOuvert_effaceToutLePermanentDeLaZone() {
        for élément in ComposerCanonicalZone.Element.allCases {
            XCTAssertFalse(
                ComposerCanonicalZone.isServed(élément, toolIsOpen: true),
                "\(élément) doit céder la place aux options de l'outil ouvert"
            )
        }
    }

    /// **L'inventaire est ÉPINGLÉ.** Sans ce témoin, les deux ci-dessus
    /// passeraient au vert sur une énumération vide, ou amputée d'un élément
    /// qu'on aurait retiré en croyant le déplacer.
    ///
    /// > Un témoin qui itère sur `allCases` mesure ce que l'énumération
    /// > CONTIENT, jamais ce qu'elle DEVRAIT contenir. Les deux se ressemblent
    /// > exactement tant que personne ne retire une entrée.
    func test_lInventaire_estCeluiQueLaDirectiveVise() {
        XCTAssertEqual(Set(ComposerCanonicalZone.Element.allCases.map(\.rawValue)),
                       ["references", "objectChips"],
                       "la zone canonique porte le pied des références et les jetons d'objet. "
                       + "PAS la rangée de portes : elle échange son contenu selon `railMode` "
                       + "et peint les contrôleurs de l'outil ouvert — l'y inscrire les "
                       + "cacherait. PAS l'en-tête du son de fond non plus : il vit AU-DESSUS "
                       + "de la carte et garde sa propre porte.")
    }

    // MARK: - La composition avec les règles qui restent locales

    /// Les jetons gardent leur condition PROPRE — une rangée vide ne se peint
    /// pas — et lisent la règle partagée pour l'autre moitié. Servir l'une sans
    /// l'autre est le défaut que la composition évite.
    func test_lesJetons_composentLaRèglePartagéeEtLaLeur() {
        let unJeton = [ComposerObjectChips.Chip(id: "c1", label: "Style")]
        XCTAssertTrue(ComposerObjectChips.isServed(toolIsOpen: false, chips: unJeton))
        XCTAssertFalse(ComposerObjectChips.isServed(toolIsOpen: true, chips: unJeton),
                       "un outil ouvert efface la rangée de jetons")
        XCTAssertFalse(ComposerObjectChips.isServed(toolIsOpen: false, chips: []),
                       "une rangée vide ne se peint pas, outil ou non")
    }
}
