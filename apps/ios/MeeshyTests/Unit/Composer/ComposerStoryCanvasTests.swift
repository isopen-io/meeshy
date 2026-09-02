import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **La story se compose dans le NOUVEAU composer** (directive porteur
/// 2026-09-01).
///
/// > « Il faut déjà désactiver dans le nouveau composer de charger l'autre vue
/// > de composer de story, et de simplement mettre à jour le type du champ en
/// > story, créer un canvas automatiquement si inexistant, enlever les éléments
/// > de la rangée canonique car destinés pour les posts. »
final class ComposerStoryCanvasTests: XCTestCase {

    private func slideVierge() -> StorySlide { StorySlide(order: 0) }

    // MARK: - L'autre composer ne se charge plus

    /// **Le témoin central.** `.scene` monte `StoryComposerView` — l'atelier,
    /// c'est-à-dire la vue de composition de story qui préexistait au meuble.
    /// Là où l'auteur CHOISIT son format, il ne s'y rend plus.
    func test_uneSTORY_choisie_neMonteJamaisLAtelier() {
        for ouverture in [ComposerOpening.keyboardOnContent, .moodGrid] {
            XCTAssertEqual(
                ComposerSurfaceRouting.surface(opening: ouverture, format: .story),
                .document,
                "l'ouverture \(ouverture) ramène l'atelier sous une story"
            )
        }
    }

    /// **L'exemption, écrite comme une règle et non subie comme un reste.**
    ///
    /// Les quatre ouvertures qui portent déjà de la matière — capture photo,
    /// capture vidéo, reprise de brouillon, média reçu d'une conversation —
    /// gardent la scène. Elles n'ouvrent sur aucun choix : elles ARRIVENT avec
    /// un contenu, et l'atelier est le seul écran qui le tienne déjà.
    /// `ConversationMediaComposerDoor` le documente pour son propre cas — son
    /// média semé disparaîtrait de l'écran ET de la publication, le brouillon
    /// du document n'ayant ni `mediaIds` ni fichier.
    ///
    /// > Une exemption qu'aucun témoin ne nomme se lit comme un oubli, et le
    /// > prochain qui « range » la supprime.
    /// **`.cameraReady` a QUITTÉ cette liste le 2026-09-01** (#4751). Elle y
    /// était entrée par ressemblance : l'argument — « elles arrivent avec du
    /// contenu » — vaut pour les trois autres et pas pour elle, la caméra
    /// n'arrivant avec RIEN. Elle promet un viseur, que le meuble sait ouvrir.
    ///
    /// > Une exemption qui couvre quatre cas d'un seul argument doit être
    /// > vérifiée sur les quatre.
    func test_lesOuverturesQuiPORTENTDeLaMatière_gardentLaScène() {
        for ouverture in [ComposerOpening.videoCameraReady, .resume, .mediaSeeded] {
            XCTAssertEqual(
                ComposerSurfaceRouting.surface(opening: ouverture, format: .story),
                .scene,
                "\(ouverture) arrive avec du contenu : le lui retirer le ferait perdre"
            )
        }
    }

    /// **Le RÉEL a rejoint le meuble le 2026-09-01** (#4751). Il était resté
    /// sur l'atelier au #4700 par prudence — sa timeline y vivait. Elle vit
    /// AUSSI au meuble depuis le #4082 (`ComposerSceneBand` porte une bande
    /// `timeline`), et le garder à part faisait changer de COMPOSER en
    /// changeant de format, sur un écran que l'auteur croit unique.
    ///
    /// > Ce témoin affirmait « c'est une décision, pas un oubli ». Il avait
    /// > raison au moment où il l'écrivait, et la décision a été REPRISE — un
    /// > témoin qui garde une décision doit pouvoir être retourné par une
    /// > décision, pas seulement par un défaut.
    func test_leRÉEL_rejointLeMeuble() {
        XCTAssertEqual(
            ComposerSurfaceRouting.surface(opening: .keyboardOnContent, format: .reel),
            .document
        )
        XCTAssertEqual(
            ComposerSurfaceRouting.surface(opening: .cameraReady, format: .post),
            .document,
            "la caméra du tray ouvre le meuble, quel que soit le format servi"
        )
    }

    // MARK: - Le canvas naît avec le format

    /// Une story montre son canvas AVANT d'avoir la moindre matière : elle
    /// n'est rien d'autre que ses unités d'histoire.
    func test_uneSTORY_montreSonCanvas_mêmeVide() {
        XCTAssertTrue(ComposerStoryCanvas.showsCanvas(format: .story, documentHasScene: false))
    }

    /// Un POST garde le prédicat qui est le sien — sa scène est une
    /// incrustation, qui naît d'un fond ou d'un média.
    func test_unPOST_garde_leprédicatDuDocument() {
        XCTAssertFalse(ComposerStoryCanvas.showsCanvas(format: .post, documentHasScene: false))
        XCTAssertTrue(ComposerStoryCanvas.showsCanvas(format: .post, documentHasScene: true))
    }

    func test_laPremièreUnité_seSèmeSeulement_siAucuneNExiste() {
        XCTAssertTrue(ComposerStoryCanvas.needsSeedSlide(format: .story, slideCount: 0))
        XCTAssertFalse(ComposerStoryCanvas.needsSeedSlide(format: .story, slideCount: 1))
        XCTAssertFalse(ComposerStoryCanvas.needsSeedSlide(format: .post, slideCount: 0),
                       "un post sans slide est un document, pas une page à semer")
    }

    // MARK: - Ce qu'on sème ne compte pas comme ce qu'on écrit

    /// **Le témoin qui empêche la flèche de mentir.** Le semis garantit qu'une
    /// slide existe toujours ; compter les slides rendrait donc publiable une
    /// story qu'on vient d'ouvrir et où personne n'a rien posé.
    func test_laSlideSEMÉE_neCompteJamaisCommeDeLaMatière() {
        XCTAssertFalse(ComposerStoryCanvas.hasMatter(slides: [slideVierge()], slideImageIds: []))
        XCTAssertFalse(ComposerStoryCanvas.hasMatter(slides: [], slideImageIds: []))
    }

    /// Un objet POSÉ est de la matière — c'est ainsi qu'on écrit dans une story,
    /// et le seul signal que le meuble peut lire.
    func test_unObjetPOSÉ_estDeLaMatière() {
        var slide = slideVierge()
        slide.effects.textObjects = [StoryTextObject(text: "bonjour")]
        XCTAssertTrue(ComposerStoryCanvas.hasMatter(slides: [slide], slideImageIds: []))
    }

    /// Un FOND choisi aussi : c'est le geste le plus court qui produise une
    /// story qu'on peut regarder.
    func test_unFOND_estDeLaMatière() {
        var slide = slideVierge()
        slide.effects.background = "#101010"
        XCTAssertTrue(ComposerStoryCanvas.hasMatter(slides: [slide], slideImageIds: []))
    }

    /// La matière se cherche sur TOUTES les unités, pas sur la courante : une
    /// story dont la deuxième page seule est remplie se publie.
    func test_laMatièreSeCherche_surTOUTESLesUnités() {
        var seconde = slideVierge()
        seconde.mediaURL = "file:///tmp/a.jpg"
        XCTAssertTrue(ComposerStoryCanvas.hasMatter(slides: [slideVierge(), seconde], slideImageIds: []))
    }

    // MARK: - La rangée canonique appartient au post

    /// > « Enlever les éléments de la rangée canonique car destinés pour les
    /// > posts (seule entité qui peut avoir un texte spécifiquement pour
    /// > contenu). »
    ///
    /// **Remis en cause le 2026-09-02, puis RÉTABLI le même jour**, sur retour
    /// porteur. J'avais servi ici les cinq outils qui posent un objet de scène,
    /// parce que je venais de retirer les rails qui les portaient. Le porteur a
    /// corrigé la cause plutôt que le symptôme : les rails sont restaurés, et
    /// cette rangée redevient étrangère à la story.
    ///
    /// > Quand un correctif ne se justifie que par un lot précédent du même
    /// > auteur, c'est ce lot qu'il faut relire, pas le correctif qu'il faut
    /// > écrire.
    func test_laRangéeCanonique_neSeSertPasSousUneSTORY() {
        XCTAssertTrue(ComposerDocumentTool.servedRow(for: .story).isEmpty)
    }

    /// Et elle reste ENTIÈRE pour les formats qui composent un champ de contenu.
    func test_laRangéeCanonique_resteEntièrePourLePOSTEtLeRÉEL() {
        XCTAssertEqual(ComposerDocumentTool.servedRow(for: .post),
                       ComposerDocumentTool.servedRow)
        XCTAssertEqual(ComposerDocumentTool.servedRow(for: .reel),
                       ComposerDocumentTool.servedRow)
        XCTAssertFalse(ComposerDocumentTool.servedRow(for: .post).isEmpty)
    }
}
