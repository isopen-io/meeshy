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

    // MARK: - La grille gouverne DEUX outils, et c'est une décision

    /// La directive en nomme deux. Les six autres restent en rangée — non par
    /// oubli mais parce qu'ils n'ont pas de nom à poser sous une boîte (une
    /// pastille de couleur EST son nom), ou qu'ils portent déjà curseurs et
    /// sous-grilles.
    func test_laGrille_neGouverneQueLeFondEtLEffet() {
        let enroulés = TextEditTool.allCases.filter { TextEditOptionsLayout.grid.wraps($0) }
        XCTAssertEqual(Set(enroulés), Set([TextEditTool.background, .effect]))
    }

    /// **Le témoin qui parle au PROCHAIN outil.** `wraps` est un `switch`
    /// exhaustif : un neuvième cas ajouté à `TextEditTool` ne compile pas tant
    /// que quelqu'un n'a pas décidé de sa disposition. Ce témoin épingle le
    /// nombre pour que l'ajout se remarque aussi ici, où la décision se lit.
    func test_huitOutils_dontDeuxEnGrille() {
        XCTAssertEqual(TextEditTool.allCases.count, 8)
    }

    // MARK: - Le gabarit rend PLUSIEURS colonnes, même sur l'écran le plus étroit

    /// **La grille doit rester une GRILLE.** Une largeur minimale de colonne
    /// trop généreuse dégraderait la mise en page en colonne unique : douze
    /// fonds sur douze rangées, soit strictement pire que la rangée qu'on
    /// remplace. 343 pt est la largeur servie sur l'iPhone le plus étroit
    /// encore pris en charge (375 pt d'écran, moins les deux marges de 16).
    func test_surLÉcranLePlusÉtroit_laGrilleRendPlusieursColonnes() {
        XCTAssertGreaterThanOrEqual(
            TextEditOptionsGridMetrics.columnCount(forWidth: 343), 3,
            "une grille à moins de trois colonnes n'apporte rien sur la rangée")
    }

    /// Douze fonds tiennent alors en quatre rangées au plus — un panneau qu'on
    /// embrasse d'un regard, ce que la rangée horizontale ne permettait pas.
    func test_lesDouzeFonds_tiennentEnPeuDeRangées() {
        let colonnes = TextEditOptionsGridMetrics.columnCount(forWidth: 343)
        let rangées = Int((Double(StoryTextBackgroundPresets.all.count) / Double(colonnes)).rounded(.up))
        XCTAssertLessThanOrEqual(rangées, 4)
    }

    /// Une largeur nulle ou négative — vue non encore mesurée — rend UNE
    /// colonne, jamais zéro : un `ForEach` sur zéro colonne ne peint rien, et
    /// un panneau vide est indiscernable d'un panneau cassé.
    func test_uneLargeurNonMesurée_rendUneColonne() {
        XCTAssertEqual(TextEditOptionsGridMetrics.columnCount(forWidth: 0), 1)
        XCTAssertEqual(TextEditOptionsGridMetrics.columnCount(forWidth: -120), 1)
    }

    /// La boîte reste au-dessus du plancher de 44 pt (dimension 5) — c'est la
    /// CIBLE que le doigt vise, et le nom posé dessous ne l'agrandit pas.
    func test_laBoîte_resteAuDessusDuPlancherTactile() {
        XCTAssertGreaterThanOrEqual(TextEditOptionsGridMetrics.boxSide, 44)
    }
}
