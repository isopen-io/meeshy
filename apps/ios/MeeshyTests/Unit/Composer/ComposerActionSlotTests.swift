import XCTest
@testable import Meeshy

/// **Ce que l'emplacement d'action MONTRE** (directive porteur 2026-09-06,
/// #5326 : « le bouton d'envoi doit devenir une des icônes de sticker
/// dynamique »).
///
/// L'emplacement de 44 points à droite du champ porte trois contenus selon
/// l'état du composer. La règle est ici, pure, plutôt qu'en trois conditions
/// enchevêtrées dans le corps de la vue : c'est la seule forme où les états qui
/// se recouvrent — du texte ET une pièce jointe, une édition en cours — se
/// vérifient sans monter un clavier.
final class ComposerActionSlotTests: XCTestCase {

    // MARK: - Du texte : le bouton d'envoi

    /// Le cas nominal de la directive : du texte, rien d'autre, un hôte qui
    /// sait envoyer un sticker.
    /// Directive porteur 2026-09-25 : « remettre le bouton envoyer quand on a
    /// un texte à envoyer plutôt que les stickers textuels ». Les cadres à mots
    /// restent à un appui long du bouton d'envoi.
    func test_duTexteSeul_montreLeBoutonDEnvoi() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: true, hasOtherContent: false, isEditMode: false, offersQuickEmoji: true),
            .send)
    }

    // MARK: - Ce qui REPREND le bouton d'envoi

    /// Une pièce jointe, un lieu ou un enregistrement en cours : le clavier
    /// peut être fermé dans ces états, et le bouton est alors le SEUL moyen
    /// d'envoyer. Le sticker ne porterait d'ailleurs pas la pièce jointe.
    func test_unePieceJointe_reprendLeBoutonDEnvoi() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: true, hasOtherContent: true, isEditMode: false, offersQuickEmoji: true),
            .send)
    }

    /// Sans texte non plus — une photo seule s'envoie par le bouton.
    func test_unePieceJointeSansTexte_montreLeBoutonDEnvoi() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: false, hasOtherContent: true, isEditMode: false, offersQuickEmoji: true),
            .send)
    }

    /// Une édition en cours valide par la coche, jamais par un sticker : on
    /// modifie un message existant, on n'en compose pas un nouveau.
    func test_uneEditionEnCours_montreLaCoche() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: true, hasOtherContent: false, isEditMode: true, offersQuickEmoji: true),
            .send)
    }

    // MARK: - Rien à envoyer

    /// Le comportement acquis (#3927) : l'emplacement vide sert deux emojis
    /// rapides plutôt qu'un bouton invisible.
    func test_rienASaisir_montreLesEmojisRapides() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: false, hasOtherContent: false, isEditMode: false, offersQuickEmoji: true),
            .quickEmoji)
    }

    /// Emojis désactivés par le mode : l'emplacement retombe sur le bouton,
    /// que le site rend invisible faute de contenu — l'emplacement, lui, ne
    /// s'effondre jamais (bug 2026-05-28).
    func test_rienASaisirSansEmoji_retombeSurLeBouton() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: false, hasOtherContent: false, isEditMode: false, offersQuickEmoji: false),
            .send)
    }

    /// Une édition dont on a tout effacé montre la coche, pas des emojis : le
    /// geste en cours est une validation.
    func test_uneEditionVidee_montreLaCoche() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: false, hasOtherContent: false, isEditMode: true, offersQuickEmoji: true),
            .send)
    }
    // MARK: - La borne des sept mots (#6537)

    /// Le comptage est une loi PURE : les espaces multiples et les retours à la
    /// ligne ne fabriquent pas de mots. `split(whereSeparator:)` écarte les
    /// séparations vides — c'est ce qui rend « a   b\n\nc » égal à trois.
    func test_leComptageIgnoreLesSeparationsVides() {
        XCTAssertEqual(ComposerActionSlot.wordCount(""), 0)
        XCTAssertEqual(ComposerActionSlot.wordCount("   "), 0)
        XCTAssertEqual(ComposerActionSlot.wordCount("a   b\n\nc"), 3)
    }

    /// LES DEUX BORNES, et elles seules : un témoin posé à 3 et à 20 passerait
    /// quelle que soit la valeur du seuil entre les deux.
    func test_laBorneEstSept() {
        XCTAssertEqual(ComposerActionSlot.textStickerWordLimit, 7)
        XCTAssertFalse(ComposerActionSlot.exceedsTextStickerLimit("un deux trois quatre cinq six sept"))
        XCTAssertTrue(ComposerActionSlot.exceedsTextStickerLimit("un deux trois quatre cinq six sept huit"))
    }

    // MARK: - Les tuiles d'action du (+) (directive porteur 2026-09-25)

    @MainActor
    func test_lesTuilesDuPlus_sontReduitesDeVingtPourcent() {
        XCTAssertEqual(UniversalComposerBar.carouselTileDiameter, 46, "58 pt × 0,8, arrondi")
        XCTAssertEqual(UniversalComposerBar.carouselTileSpacing, 11, "14 pt × 0,8, arrondi")
    }
}
