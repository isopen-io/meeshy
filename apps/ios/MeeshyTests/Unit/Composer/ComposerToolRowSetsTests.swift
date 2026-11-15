import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **#4136 — les deux rangées ont la même FORME, et ne portent pas la même
/// chose.**
///
/// La rangée de l'atelier a adopté la forme de la rangée canonique du document :
/// icônes en ligne, défilantes, même écart, même gabarit. C'est ce qu'on voulait
/// — le patron d'édition d'une slide se fixe.
///
/// C'est aussi exactement le genre de ressemblance qui fait recopier une entrée
/// d'un jeu dans l'autre « par ressemblance de nom ». Les deux jeux répondent à
/// des questions différentes :
///
/// | rangée | ce qu'elle fait |
/// |---|---|
/// | document (`ComposerDocumentTool`) | ouvre des **portes d'ingestion** — la matière ENTRE dans le brouillon |
/// | atelier (`StoryToolMode.composerOrder`) | outille la **scène** — la matière est déjà là, on la travaille |
///
/// `ComposerOverflowPolicy` documente déjà ce défaut pour le `⋯`. Ce témoin le
/// tient pour les deux rangées, et il le tient sur les DEUX sens : ni l'un ni
/// l'autre ne doit se mettre à porter une entrée de son voisin.
final class ComposerToolRowSetsTests: XCTestCase {

    /// Les deux jeux sont DISJOINTS par leur nature, pas par hasard. Un nom
    /// commun ne serait pas une erreur en soi — mais il voudrait dire qu'une
    /// même entrée existe des deux côtés, et c'est cela qu'il faut regarder en
    /// face plutôt que découvrir à l'écran.
    func test_lesDeuxJeux_nOntAucuneEntreeEnCommun() {
        let document = Set(ComposerDocumentTool.allCases.map(\.rawValue))
        let atelier = Set(StoryToolMode.composerOrder.map(\.rawValue))
        let communs = document.intersection(atelier).sorted()

        XCTAssertTrue(
            communs.isEmpty,
            "Ces entrées existent dans les DEUX rangées : \(communs). Une entrée partagée doit être "
                + "un CHOIX écrit — la rangée du document fait ENTRER de la matière, celle de l'atelier "
                + "la travaille. Si l'entrée fait vraiment les deux, dire ici pourquoi."
        )
    }

    /// Le fusible : sans lui, l'assertion ci-dessus passerait au vert sur deux
    /// ensembles VIDES le jour où l'un des deux enums est renommé.
    func test_lesDeuxJeux_sontNonVides_etDeTaillePlausible() {
        XCTAssertGreaterThanOrEqual(ComposerDocumentTool.allCases.count, 5)
        XCTAssertEqual(
            StoryToolMode.composerOrder.count, 6,
            "La rangée de l'atelier sert six outils. En perdre un sans le dire retirerait une capacité "
                + "de la scène ; en gagner un sans chemin peindrait une affordance sans effet (loi 4)."
        )
    }

    /// L'ordre canonique est la RÉFÉRENCE : la rangée, la grille d'état vide et
    /// les chips de switch le suivent. Trois écritures manuelles avaient laissé
    /// trois ordres diverger — le commentaire de `ComposerToolRow` le rappelle,
    /// et ce témoin l'empêche de redevenir faux.
    func test_lOrdreCanonique_commenceParLeMedia_etFinitParLaTimeline() {
        XCTAssertEqual(StoryToolMode.composerOrder.first, .media)
        XCTAssertEqual(StoryToolMode.composerOrder.last, .timeline)
        XCTAssertFalse(
            StoryToolMode.composerOrder.contains(.filters),
            "`.filters` n'a pas de panneau : le servir ici peindrait une porte qui n'ouvre rien."
        )
    }

    // MARK: - La FORME, et là où elle diverge volontairement

    /// La rangée de l'atelier DÉFILE, comme la canonique. Le besoin est mesuré :
    /// à `accessibility-XXXL` une rangée figée dépasse la largeur de l'écran et
    /// se fait couper des deux côtés — des outils qu'aucun geste n'atteint.
    func test_laRangeeDeLAtelier_defile_commeLaCanonique() throws {
        let code = try AppSourceGuard.stripComments(source())
        XCTAssertTrue(
            compact(code).contains("ScrollView(.horizontal,showsIndicators:false)"),
            "Sans défilement, la rangée redevient coupée aux grandes tailles de police."
        )
    }

    /// **Et elle NE reprend PAS le premier plan de la canonique.** Celle du
    /// document peint en `textSecondary(isDark: true)` parce qu'elle vit sur un
    /// plateau toujours sombre ; le plateau de l'atelier prend la couleur du
    /// fond de la scène (#4124), et ce gris y disparaît sur un pastel.
    ///
    /// Garde NÉGATIVE : elle rougirait si quelqu'un « alignait » l'atelier sur
    /// la canonique en recopiant sa couleur — l'alignement le plus tentant, et
    /// le seul qui casse quelque chose.
    func test_laRangeeDeLAtelier_neRecopiePas_leGrisEnDurDeLaCanonique() throws {
        let code = try AppSourceGuard.stripComments(source())
        XCTAssertFalse(
            code.contains("textSecondary(isDark: true)"),
            "Le plateau de l'atelier prend la couleur du fond de la scène : un gris clair en dur y "
                + "disparaît. `glassControlForeground()` est adaptatif — c'est la raison, pas un goût."
        )
        XCTAssertTrue(
            code.contains("glassControlForeground()"),
            "… et l'adaptatif doit bien être là : sans lui, cette garde négative serait verte sur une "
                + "rangée sans aucun premier plan."
        )
    }

    /// La cible tactile ne suit pas l'icône. Les pastilles de 48 pt tenaient les
    /// 44 pt du HIG sans y penser ; un glyphe nu de ~22 pt ne les tient pas.
    func test_laCibleTactile_reste_a44pt_malgreLIconeNue() throws {
        let code = try AppSourceGuard.stripComments(source())
        XCTAssertTrue(
            compact(code).contains("hitSide:CGFloat=44"),
            "Une icône nue sans débord de contact descend sous la cible minimale du HIG."
        )
    }

    // MARK: - Lecture de source

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Composer
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // racine du dépôt
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerToolRow.swift")
        let brut = try String(contentsOf: url, encoding: .utf8)
        XCTAssertGreaterThan(brut.count, 2000, "Source vide — les gardes seraient vertes par omission.")
        return brut
    }

    private func compact(_ text: String) -> String {
        text.components(separatedBy: .whitespacesAndNewlines).joined()
    }
}
