import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// #5045 — **la grille verticale est une DEMANDE de l'hôte, pas un changement
/// subi.**
///
/// > « Il faut lister les Fond en verticale sur le nombre de rangé qui entre
/// > dans l'écran. Pareil pour les effets, il faut montrer l'exemple dans la
/// > boxe (mis à l'échelle), le nom de l'option en bas et non dans la box…
/// > listé verticalement centré aussi » — porteur, 2026-09-03
///
/// ## Ce que ces témoins gardent
///
/// Le risque de ce lot n'est pas la grille : c'est qu'elle DÉBORDE sur les
/// deux hôtes qui ne peuvent pas la porter. `TextEditToolOptions` est monté
/// par trois écrans, dont deux vivent dans une bande de hauteur comptée — la
/// barre au-dessus du clavier et la zone basse de la scène. Une grille y
/// mangerait la carte 9:16, exactement ce que la directive du 2026-09-03
/// (« laisser la place au canvas ») demandait de rendre.
///
/// Le DÉFAUT est donc la moitié de la garde : un hôte qui ne dit rien doit
/// garder sa rangée.
final class TextEditOptionsLayoutTests: XCTestCase {

    // MARK: - La rangée ne se transforme jamais toute seule

    /// **`.row` ne s'enroule sur AUCUN outil.** C'est ce qui rend le paramètre
    /// sûr : les deux hôtes SDK ne passent rien, reçoivent `.row`, et ne
    /// changent pas d'un pixel.
    func test_laRangée_neSEnroulePourAucunOutil() {
        for outil in TextEditTool.allCases {
            XCTAssertFalse(TextEditOptionsLayout.row.wraps(outil),
                           "\(outil) ne doit PAS s'enrouler en disposition rangée")
        }
    }

    // MARK: - La grille gouverne TROIS outils, et c'est une décision

    /// La première directive en nommait deux ; celle du 2026-09-05 (#5244) y
    /// ajoute la POLICE — « aligne les polices rangée par rangée comme les
    /// effets ». Les cinq autres restent en rangée, non par oubli mais parce
    /// qu'ils n'ont pas de nom à poser sous une boîte (une pastille de couleur
    /// EST son nom), ou qu'ils portent déjà curseurs et sous-grilles.
    func test_laGrille_gouverneLeFondLEffetEtLaPolice() {
        let enroulés = TextEditTool.allCases.filter { TextEditOptionsLayout.grid.wraps($0) }
        XCTAssertEqual(Set(enroulés), Set([TextEditTool.background, .effect, .style]))
    }

    /// **Le témoin qui parle au PROCHAIN outil.** `wraps` est un `switch`
    /// exhaustif : un neuvième cas ajouté à `TextEditTool` ne compile pas tant
    /// que quelqu'un n'a pas décidé de sa disposition. Ce témoin épingle le
    /// nombre pour que l'ajout se remarque aussi ici, où la décision se lit.
    func test_huitOutils_dontTroisEnGrille() {
        XCTAssertEqual(TextEditTool.allCases.count, 8)
    }

    // MARK: - Le gabarit rend CINQ colonnes, et elles tiennent partout

    /// **Cinq par rangée, et c'est un CONTRAT, plus une conséquence**
    /// (directive porteur 2026-09-05 : « il faut 5 éléments par rangée »).
    ///
    /// Le gabarit était adaptatif : `columnCount(forWidth:)` disait combien de
    /// colonnes entraient, et la réponse dépendait de l'appareil — quatre sur
    /// un iPhone 16 Pro, mesuré. Les trois témoins qui vivaient ici gardaient
    /// cette arithmétique ; ils n'ont plus d'objet, et ce qui les remplace
    /// garde l'invariant devenu vrai.
    func test_laGrilleRendCinqColonnes() {
        XCTAssertEqual(TextEditOptionsGridMetrics.columns, 5)
    }

    /// **Le compte étant FIXE, c'est la BOÎTE qui doit tenir.**
    ///
    /// Ce que le gabarit adaptatif protégeait — ne jamais dégénérer en colonne
    /// unique — était garanti par SwiftUI. Avec cinq colonnes imposées, c'est
    /// l'inverse qui menace : une boîte trop large rogne la cinquième, ou
    /// écrase les cinq. Le témoin s'éprouve sur le PLUS ÉTROIT des appareils
    /// servis, jamais sur celui qui exécute le test.
    func test_cinqBoîtes_tiennentSurLÉcranLePlusÉtroit() {
        XCTAssertTrue(TextEditOptionsGridMetrics.fitsNarrowestDevice(),
                      "cinq boîtes de \(TextEditOptionsGridMetrics.boxSide) pt ne tiennent pas "
                        + "dans \(TextEditOptionsGridMetrics.narrowestDeviceWidth) pt")
    }

    /// Et la marge n'est pas une supposition : le témoin ci-dessus passerait
    /// aussi avec zéro point de reste, ce qui donnerait cinq boîtes collées
    /// bord à bord. Celui-ci exige que la grille RESPIRE.
    func test_laGrille_gardeDeLAirSurLÉcranLePlusÉtroit() {
        let utile = TextEditOptionsGridMetrics.narrowestDeviceWidth
            - 2 * TextEditOptionsGridMetrics.hostHorizontalPadding
        let requis = CGFloat(TextEditOptionsGridMetrics.columns) * TextEditOptionsGridMetrics.boxSide
            + CGFloat(TextEditOptionsGridMetrics.columns - 1) * TextEditOptionsGridMetrics.columnSpacing
        XCTAssertGreaterThanOrEqual(utile - requis, 8,
                                    "moins de 8 pt de reste : les boîtes se touchent")
    }

    /// La boîte reste au-dessus du plancher de 44 pt (dimension 5) — c'est la
    /// CIBLE que le doigt vise, et le nom posé dessous ne l'agrandit pas.
    func test_laBoîte_resteAuDessusDuPlancherTactile() {
        XCTAssertGreaterThanOrEqual(TextEditOptionsGridMetrics.boxSide, 44)
    }
}
