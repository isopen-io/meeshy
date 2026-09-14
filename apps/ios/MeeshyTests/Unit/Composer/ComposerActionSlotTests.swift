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

    // MARK: - Le cadre à mots

    /// Le cas nominal de la directive : du texte, rien d'autre, un hôte qui
    /// sait envoyer un sticker.
    func test_duTexteSeul_montreLeCadreAMots() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: true, hasOtherContent: false, isEditMode: false,
                                       isSending: false, keyboardIsUp: true, offersQuickEmoji: true, offersTextSticker: true, exceedsWordLimit: false),
            .textSticker)
    }

    /// **LE témoin du lot.** Un hôte qui ne câble pas l'envoi de sticker
    /// (commentaires, post, story) garde son bouton d'envoi : une pastille qui
    /// ne peut rien envoyer serait un contrôle inerte (loi 4).
    func test_sansHoteCable_leBoutonDEnvoiReste() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: true, hasOtherContent: false, isEditMode: false,
                                       isSending: false, keyboardIsUp: true, offersQuickEmoji: true, offersTextSticker: false, exceedsWordLimit: false),
            .send)
    }

    /// **LE second témoin du lot.** Un brouillon restauré à l'ouverture de la
    /// conversation remplit le champ SANS ouvrir le clavier. Servir la pastille
    /// là aurait retiré le seul moyen d'envoyer ce texte : la touche Retour
    /// n'est pas à l'écran, et la pastille n'envoie pas de texte simple.
    func test_leClavierBaisse_rendLeBoutonDEnvoi() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: true, hasOtherContent: false, isEditMode: false,
                                       isSending: false, keyboardIsUp: false,
                                       offersQuickEmoji: true, offersTextSticker: true, exceedsWordLimit: false),
            .send)
    }

    // MARK: - Ce qui REPREND le bouton d'envoi

    /// Une pièce jointe, un lieu ou un enregistrement en cours : le clavier
    /// peut être fermé dans ces états, et le bouton est alors le SEUL moyen
    /// d'envoyer. Le sticker ne porterait d'ailleurs pas la pièce jointe.
    func test_unePieceJointe_reprendLeBoutonDEnvoi() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: true, hasOtherContent: true, isEditMode: false,
                                       isSending: false, keyboardIsUp: true, offersQuickEmoji: true, offersTextSticker: true, exceedsWordLimit: false),
            .send)
    }

    /// Sans texte non plus — une photo seule s'envoie par le bouton.
    func test_unePieceJointeSansTexte_montreLeBoutonDEnvoi() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: false, hasOtherContent: true, isEditMode: false,
                                       isSending: false, keyboardIsUp: true, offersQuickEmoji: true, offersTextSticker: true, exceedsWordLimit: false),
            .send)
    }

    /// Une édition en cours valide par la coche, jamais par un sticker : on
    /// modifie un message existant, on n'en compose pas un nouveau.
    func test_uneEditionEnCours_montreLaCoche() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: true, hasOtherContent: false, isEditMode: true,
                                       isSending: false, keyboardIsUp: true, offersQuickEmoji: true, offersTextSticker: true, exceedsWordLimit: false),
            .send)
    }

    /// Un envoi déjà en vol garde l'emplacement au bouton (que l'hôte masque),
    /// pour ne pas offrir un second départ pendant le premier.
    func test_unEnvoiEnVol_neProposePasLeCadre() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: true, hasOtherContent: false, isEditMode: false,
                                       isSending: true, keyboardIsUp: true, offersQuickEmoji: true, offersTextSticker: true, exceedsWordLimit: false),
            .send)
    }

    // MARK: - Rien à envoyer

    /// Le comportement acquis (#3927) : l'emplacement vide sert deux emojis
    /// rapides plutôt qu'un bouton invisible.
    func test_rienASaisir_montreLesEmojisRapides() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: false, hasOtherContent: false, isEditMode: false,
                                       isSending: false, keyboardIsUp: true, offersQuickEmoji: true, offersTextSticker: true, exceedsWordLimit: false),
            .quickEmoji)
    }

    /// Emojis désactivés par le mode : l'emplacement retombe sur le bouton,
    /// que le site rend invisible faute de contenu — l'emplacement, lui, ne
    /// s'effondre jamais (bug 2026-05-28).
    func test_rienASaisirSansEmoji_retombeSurLeBouton() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: false, hasOtherContent: false, isEditMode: false,
                                       isSending: false, keyboardIsUp: true, offersQuickEmoji: false, offersTextSticker: true, exceedsWordLimit: false),
            .send)
    }

    /// Une édition dont on a tout effacé montre la coche, pas des emojis : le
    /// geste en cours est une validation.
    func test_uneEditionVidee_montreLaCoche() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: false, hasOtherContent: false, isEditMode: true,
                                       isSending: false, keyboardIsUp: true, offersQuickEmoji: true, offersTextSticker: true, exceedsWordLimit: false),
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

    /// À SEPT MOTS la pastille reste — la borne est « au-delà », pas « à partir de ».
    func test_aSeptMots_leCadreAMotsReste() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: true, hasOtherContent: false, isEditMode: false,
                                       isSending: false, keyboardIsUp: true, offersQuickEmoji: true,
                                       offersTextSticker: true, exceedsWordLimit: false),
            .textSticker)
    }

    /// **LE témoin du lot.** Au-delà, le bouton ordinaire gagne — et il gagne
    /// sur un clavier OUVERT, l'état où la pastille l'emportait jusqu'ici.
    /// C'est la seule condition qui regarde le CONTENU et non le chrome.
    func test_auDelaDeSeptMots_leBoutonOrdinaireGagne() {
        XCTAssertEqual(
            ComposerActionSlot.resolve(hasText: true, hasOtherContent: false, isEditMode: false,
                                       isSending: false, keyboardIsUp: true, offersQuickEmoji: true,
                                       offersTextSticker: true, exceedsWordLimit: true),
            .send)
    }

}
