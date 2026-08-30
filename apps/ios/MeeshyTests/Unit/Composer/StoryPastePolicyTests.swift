import XCTest
import MeeshyUI
@testable import Meeshy

/// **#4378 — où va ce qu'on colle.**
///
/// La règle est pure parce qu'elle est décidable, et parce qu'on voudra la
/// relire : « pourquoi mon image est-elle partie en fond ? » se répond en la
/// lisant, pas en instrumentant un écran.
final class StoryPastePolicyTests: XCTestCase {

    // MARK: - Le texte

    func test_unTexteCourt_devientUnObjetDeScene() {
        XCTAssertEqual(
            StoryPastePolicy.placement(forText: "Bonjour tout le monde"),
            .textObject("Bonjour tout le monde")
        )
    }

    func test_unTexteLong_vaDansLaDescription_carIlCouvriraitLaScene() {
        let long = "un deux trois quatre cinq six sept huit neuf dix onze"
        XCTAssertEqual(StoryPastePolicy.placement(forText: long), .description(long))
    }

    /// Le seuil est un « strictement plus de » : dix mots restent sur la scène.
    /// Ce témoin existe parce qu'une borne se trompe d'un cran plus souvent
    /// qu'elle ne se trompe de sens.
    func test_leSeuil_estUnStrictementPlusDe() {
        let dix = "un deux trois quatre cinq six sept huit neuf dix"
        XCTAssertEqual(StoryPastePolicy.wordCount(dix), 10)
        XCTAssertEqual(StoryPastePolicy.placement(forText: dix), .textObject(dix))

        let onze = dix + " onze"
        XCTAssertEqual(StoryPastePolicy.placement(forText: onze), .description(onze))
    }

    /// Un texte collé depuis une page web arrive avec des espaces doubles et des
    /// sauts de ligne. Compter les blancs comme des mots l'enverrait en
    /// description bien avant le dixième mot réel.
    func test_lesBlancsNeSontPasDesMots() {
        XCTAssertEqual(StoryPastePolicy.wordCount("  un   deux \n\n trois \t quatre  "), 4)
    }

    /// Compter des MOTS, pas des caractères : « anticonstitutionnellement » est
    /// un mot long, pas une légende.
    func test_unMotTresLong_resteUnObjet() {
        XCTAssertEqual(
            StoryPastePolicy.placement(forText: "anticonstitutionnellement"),
            .textObject("anticonstitutionnellement")
        )
    }

    /// Coller le vide n'est pas une erreur à annoncer : c'est un geste sans
    /// matière. Lui donner une destination créerait un objet invisible que
    /// l'auteur devrait ensuite trouver pour le supprimer.
    func test_leVide_nePlaceRien() {
        XCTAssertNil(StoryPastePolicy.placement(forText: ""))
        XCTAssertNil(StoryPastePolicy.placement(forText: "   \n\t  "))
    }

    /// Le texte SERVI est nettoyé : les blancs de bord d'un copier-coller ne
    /// doivent pas voyager jusqu'à la scène.
    func test_leTexteServi_estNettoyeDeSesBords() {
        XCTAssertEqual(StoryPastePolicy.placement(forText: "  salut  "), .textObject("salut"))
    }

    // MARK: - Le média

    /// **Le cas qui fait la règle.** La même matière va à deux endroits selon ce
    /// que la scène porte déjà : une image posée en premier plan sur une scène
    /// vide donnerait une vignette flottant sur du vide.
    func test_unMedia_devientLeFOND_quandLaSceneNenAPas() {
        XCTAssertEqual(StoryPastePolicy.placement(forMediaWhenSceneHasBackground: false), .background)
    }

    func test_unMedia_sePose_quandLaSceneAUnFond() {
        XCTAssertEqual(StoryPastePolicy.placement(forMediaWhenSceneHasBackground: true), .foreground)
    }

    /// Garde de FORME : la règle du média ne prend QUE l'état de la scène.
    /// Ajouter le type du média à sa signature inviterait à faire diverger image,
    /// vidéo et son — que la directive traite explicitement de la même façon.
    /// Le témoin ne peut pas l'empêcher au compilateur ; il le dit là où on
    /// viendra le lire.
    func test_lesTroisFamilles_sontTraiteesPareil_parConstruction() {
        for aUnFond in [true, false] {
            let place = StoryPastePolicy.placement(forMediaWhenSceneHasBackground: aUnFond)
            XCTAssertEqual(place, aUnFond ? .foreground : .background,
                           "image, vidéo et son partagent la MÊME décision : seule la scène compte.")
        }
    }
}
