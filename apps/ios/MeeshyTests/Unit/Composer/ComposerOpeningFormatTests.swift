import XCTest
@testable import Meeshy

/// **Une porte peut TRANSPORTER un format déjà choisi, jamais le deviner**
/// (#5055).
///
/// Le menu du lecteur de stories offre deux gestes distincts : « Republier » et
/// « Éditer et republier **en post** ». Le second a DIT son format ; rouvrir sur
/// celui de la source lui ferait redire ce qu'il vient de dire.
///
/// ## La frontière avec la décision #4623
///
/// Le porteur a retiré `.reelTab` le 2026-08-31 avec cette raison : « une porte
/// qui déclare son format d'avance, **là où la décision doit se prendre APRÈS**,
/// quand l'auteur voit ce qu'il compose ». Elle vise une porte qui PRÉSUME — le
/// `+` d'un onglet « réel » suppose que l'auteur veut un réel avant d'avoir rien
/// composé.
///
/// > La différence n'est pas « avant / après » mais **« deviné / dit »**. Une
/// > porte qui devine impose ; une porte qui transporte un choix explicite
/// > obéit. Et l'éventail reste peint dans les deux cas : le format est
/// > pré-rempli, jamais verrouillé (loi 9 — le format est un CHAMP).
///
/// Ce fichier garde les deux moitiés : que le transport marche, et qu'il ne
/// puisse pas ouvrir sur une surface dont l'éventail n'offre pas la sortie.
final class ComposerOpeningFormatTests: XCTestCase {

    private func ouverture(_ intent: ComposerIntent, réel: Bool = false) -> ComposerFormat {
        intent.openingFormat(compositionQualifiesAsReel: réel)
    }

    // MARK: - 1 · Sans geste, la table décide — comme avant

    /// **Non-vacuité, et non-régression.** Huit portes sur neuf ne passent
    /// aucun `opening` : si ce témoin tombait, le paramètre aurait changé le
    /// comportement de tout le dépôt au lieu d'ajouter un cas.
    func test_sansFormatDemande_lOuvertureEstCelleDeLaTable() {
        XCTAssertEqual(ouverture(ComposerIntent(origin: .storyTray)), .story)
        XCTAssertEqual(ouverture(ComposerIntent(origin: .moodChip)), .status)
        XCTAssertEqual(
            ouverture(ComposerIntent(origin: .repost(ofPostId: "s", sourceFormat: .story))),
            .story,
            "Le format d'un repost MIROITE celui de sa source quand rien n'est demandé."
        )
    }

    // MARK: - 2 · Un format DIT est honoré

    func test_unFormatDemande_etOffert_estHonore() {
        let intent = ComposerIntent(
            origin: .repost(ofPostId: "s", sourceFormat: .story),
            opening: .post
        )
        XCTAssertEqual(ouverture(intent), .post,
                       "« Éditer et republier en post » ouvre sur le POST : l'ANCRAGE est offert "
                           + "par l'éventail d'un repost de story (`[.story, .post]`).")
    }

    // MARK: - 3 · Un format NON offert est ignoré, jamais honoré

    /// **La borne, et la raison d'être du site unique.**
    ///
    /// Ouvrir sur un format absent de l'éventail poserait l'auteur sur une
    /// surface que l'éventail ne permet pas de QUITTER : un cul-de-sac où le
    /// seul geste restant est de fermer. Le repli sur la table n'est pas une
    /// tolérance — c'est le seul état dont on sache qu'il a une sortie.
    func test_unFormatNonOffert_retombeSurLaTable() {
        let intent = ComposerIntent(origin: .moodChip, opening: .reel)
        XCTAssertEqual(ouverture(intent), .status,
                       "L'éventail d'un mood n'offre pas le réel : l'ouvrir dessus ferait une "
                           + "surface sans sortie.")
    }

    /// Le cas jumeau, sur la porte qui nous intéresse : un repost de story
    /// n'offre pas le RÉEL.
    func test_unRepostDeStory_neSOuvrePasEnReel() {
        let intent = ComposerIntent(
            origin: .repost(ofPostId: "s", sourceFormat: .story),
            opening: .reel
        )
        XCTAssertEqual(ouverture(intent), .story)
    }

    // MARK: - 4 · L'identité de l'intention inclut son ouverture

    /// Deux intentions qui ouvrent différemment ne sont PAS la même. Sans cela,
    /// une vue SwiftUI qui compare des intentions pourrait réutiliser l'état
    /// d'une porte pour l'autre — et « Éditer et republier en post » rouvrirait
    /// sur la story du geste précédent.
    func test_deuxOuverturesDifferentes_fontDeuxIntentionsDifferentes() {
        let origine = ComposerOrigin.repost(ofPostId: "s", sourceFormat: .story)
        XCTAssertNotEqual(ComposerIntent(origin: origine),
                          ComposerIntent(origin: origine, opening: .post))
    }
}
