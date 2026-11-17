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
    /// trois ordres diverger — ce témoin l'empêche de redevenir faux.
    func test_lOrdreCanonique_commenceParLeMedia_etFinitParLaTimeline() {
        XCTAssertEqual(StoryToolMode.composerOrder.first, .media)
        XCTAssertEqual(StoryToolMode.composerOrder.last, .timeline)
        XCTAssertFalse(
            StoryToolMode.composerOrder.contains(.filters),
            "`.filters` n'a pas de panneau : le servir ici peindrait une porte qui n'ouvre rien."
        )
    }
}
