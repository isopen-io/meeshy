import XCTest
import MeeshySDK
@testable import Meeshy

/// **Une image du brouillon d'un message s'édite dans la MÊME scène plein
/// écran, puis repart dans le fil** (#8416 — objectif du chantier : « unifier
/// rapidement l'édition d'image envoyée dans une conversation »).
///
/// Elle s'éditait dans `MeeshyImageEditorView`, un éditeur à part : deux
/// chromes, deux gestuelles, deux jeux d'outils pour la même photo selon
/// qu'elle partait en story ou dans un message. La retouche d'une image du
/// brouillon ouvre désormais le composer, et « Terminé » rend l'image composée
/// au message.
final class ComposerConversationImageTests: XCTestCase {

    /// L'origine ne propose AUCUN format : l'image repart dans le fil, elle ne
    /// se publie pas. Un choix de format serait une question sans objet.
    func test_laRetoucheDUneImageDuFil_neProposeQueLaScene() {
        let profil = ComposerProfile.profile(for: .conversationDraftImage)
        XCTAssertEqual(profil.offeredFormats, [.story])
        XCTAssertEqual(profil.opensWith, .mediaSeeded)
        XCTAssertNil(ComposerOrigin.conversationDraftImage.resumedDraftId)
        XCTAssertNil(ComposerOrigin.conversationDraftImage.repostedPostId)
    }

    /// Le composite rendu garde le FORMAT de la scène — une photo paysage
    /// repart paysage, jamais rognée en 9:16.
    func test_laTailleRendue_suitLeRatioDeLaScene() {
        let portrait = ComposerReturnImage.renderSize(ratio: 9.0 / 16.0)
        XCTAssertEqual(portrait.width / portrait.height, 9.0 / 16.0, accuracy: 0.001)
        let paysage = ComposerReturnImage.renderSize(ratio: 16.0 / 9.0)
        XCTAssertEqual(paysage.width / paysage.height, 16.0 / 9.0, accuracy: 0.001)
        XCTAssertEqual(max(paysage.width, paysage.height), ComposerReturnImage.longEdgePoints)
    }

    /// Le socle d'une retouche ne porte ni audience ni menu de formats — une
    /// seule capsule, « Terminé ».
    func test_leSocleDUneRetouche_neMontreQueTermine() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(code.contains("ifreturnsImageToConversation{Spacer();returnImageButton}else{"),
                      "En retouche, le socle ne porte que la capsule Terminé.")
    }

    /// **Aucun contrôle sans objet** (directive porteur 2026-09-27) : une image
    /// qui repart dans le fil n'a ni mention, ni hashtag, ni lieu, ni
    /// description, ni son — seules restent les portes qui la PEIGNENT.
    func test_laRetouche_neSertQueLesPortesQuiPeignent() {
        XCTAssertEqual(ComposerReturnImage.paintingDoors,
                       [.media, .text, .sticker, .drawing, .background])
        for sansObjet in [ComposerRailDoor.mention, .hashtag, .place, .description, .content, .sound] {
            XCTAssertFalse(ComposerReturnImage.paintingDoors.contains(sansObjet), "\(sansObjet)")
        }
    }
}
