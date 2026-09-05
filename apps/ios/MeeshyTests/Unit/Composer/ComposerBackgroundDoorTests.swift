import XCTest
@testable import Meeshy

/// **La porte FOND du rail gauche** (#4919).
///
/// > Directive porteur 2026-09-02 : « Il faut un outil de fond dans la liste de
/// > gauche dès qu'on a une scène, pour faciliter la configuration de la
/// > scène. »
///
/// ## Ce que ce lot RENVERSE, et qu'il faut dire à voix haute
///
/// `apps/ios/CLAUDE.md` § 2 rangeait le fond sur la LIGNE CANONIQUE : « ce qui
/// appartient à l'ENVOI ou à la slide (… image/vidéo de fond …) → ligne
/// canonique, en bas », et quatre lignes plus bas « une image de FOND
/// appartient à la slide et vit en bas ».
///
/// La directive du 2026-09-02 dit l'inverse et, étant postérieure, gagne. Mais
/// elle ne se contente pas de gagner par la date : **la raison écrite au § 2
/// pour ranger le fond en bas était « rien de tout cela n'a de place sur la
/// scène ».** C'est vrai d'une mention, d'un lieu, d'un son de fond. C'est faux
/// d'un fond visuel — il n'est rien d'autre QUE la scène, et c'est le seul de
/// la liste qui occupe 100 % des pixels du canvas. La ligne était mal classée ;
/// la directive la corrige au lieu de la contredire.
///
/// La ligne du § 2 bascule dans le MÊME commit que ces témoins, ce que la règle
/// du dépôt exige : une ligne de gouvernance qui change avant son gate ferait
/// décrire au document une géographie que le code n'a pas.
final class ComposerBackgroundDoorTests: XCTestCase {

    // MARK: - Le niveau, et le témoin qui le PORTE

    /// **Le fond agit sur la SCÈNE**, comme le dessin — et pour la même raison.
    ///
    /// `.slide` le ferait paraître sur un `status`, qui n'a pas de toile.
    /// `.object` promettrait les contrôleurs d'empilement du rail *trailing* à
    /// quelque chose qui n'est pas un objet : un fond n'est ni sélectionnable,
    /// ni déplaçable, ni au-dessus de quoi que ce soit — il est DERRIÈRE tout.
    func test_leFond_agitSurLaScene() {
        XCTAssertEqual(ComposerRailDoor.background.level(for: .story), .scene)
    }

    /// **Le témoin qui porte le renversement s'écrit sur un format AUTRE que la
    /// story**, et c'est tout son intérêt.
    ///
    /// En Story, quatre portes basculent `.object` selon le format (#4893) et
    /// tout ce qui est `.object` ou `.scene` va déjà à gauche : un mauvais
    /// classement y rendrait le même verdict que le bon. C'est sur un POST que
    /// l'ancienne ligne du § 2 se lisait — « le fond appartient à la slide et
    /// vit en bas » — donc c'est là qu'un retour en arrière se verrait.
    func test_leFond_resteAGaucheHorsStory() {
        for format in [ComposerFormat.post, .reel] {
            XCTAssertEqual(ComposerRailDoor.background.level(for: format), .scene,
                           "le fond ne bascule PAS par format : il EST la scène, quel que soit le profil")
            let gauche = ComposerSceneFloatingRail.sideRow(
                from: ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                               format: format, allowsCapture: true),
                format: format)
            XCTAssertTrue(gauche.contains(.background),
                          "directive 2026-09-02 : le fond vit à GAUCHE, pas sur la ligne canonique")
        }
    }

    /// Et il n'est JAMAIS sur la ligne canonique — les deux rangées étant une
    /// partition, ce témoin est la moitié qu'on oublie d'écrire.
    func test_leFond_nEstJamaisSurLaLigneCanonique() {
        for format in [ComposerFormat.story, .post, .reel] {
            let bas = ComposerSceneFloatingRail.lowRow(
                from: ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                               format: format, allowsCapture: true),
                format: format)
            XCTAssertFalse(bas.contains(.background), "format \(format)")
        }
    }

    // MARK: - « dès qu'on a une scène »

    /// La condition d'apparition n'a demandé AUCUNE règle nouvelle : elle tombe
    /// de `appearsOnCanvas`, que `offered` applique déjà. Une porte de niveau
    /// `.scene` ne survit pas à un format sans toile.
    func test_laPorteFond_disparaitDunStatus() {
        let portes = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                              format: .status, allowsCapture: true)
        XCTAssertFalse(portes.contains(.background))
    }

    func test_laPorteFond_estServie() {
        XCTAssertTrue(ComposerSceneCapabilities.doors.contains(.background))
        XCTAssertTrue(ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                               format: .story, allowsCapture: true)
            .contains(.background))
    }

    // MARK: - Le DOUBLON que la porte referme

    /// **Une palette atteignable deux fois n'est pas deux fois plus atteignable.**
    ///
    /// Le `⋯` servait `pickBackground` UNIQUEMENT parce que la surface de scène
    /// n'avait aucun chemin vers la palette — `ComposerOverflowPolicy` le dit :
    /// « un appelant qui l'ignore n'obtient jamais un DOUBLON de contrôle ».
    /// La porte crée ce chemin ; laisser l'entrée du menu produirait exactement
    /// le doublon que ce paramètre existe pour éviter.
    ///
    /// La RÈGLE ne change pas — elle garde son paramètre et ses deux réponses,
    /// que les témoins voisins épinglent. Ce qui change est le FAIT que l'hôte
    /// lui rapporte.
    func test_laPaletteAtteignable_retireLEntreeDuMenu() {
        let servies = ComposerOverflowPolicy.entries(hasBackground: true,
                                                     hasMedia: false,
                                                     hasText: false,
                                                     hasLocation: false,
                                                     backgroundPickerIsReachable: true)
        XCTAssertFalse(servies.contains(.pickBackground))
        XCTAssertTrue(servies.contains(.removeBackground),
                      "retirer le fond reste au menu : la porte l'OUVRE, elle ne l'efface pas")
    }
}
