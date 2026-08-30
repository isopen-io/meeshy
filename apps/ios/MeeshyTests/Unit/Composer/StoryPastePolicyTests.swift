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

    // MARK: - Ce que cette règle NE porte pas, et pourquoi

    /// **Le média n'a pas sa branche ici, et c'est le point.**
    ///
    /// La directive demande qu'un média collé aille en fond quand la scène n'en
    /// a pas — et cette règle EXISTE déjà, à l'endroit où l'insertion se fait :
    /// `shouldBeBackground` pour l'image et la vidéo, `ComposerAudioPlacement`
    /// pour le son. La réécrire ici aurait donné deux règles pour une question,
    /// et la seconde aurait divergé en silence — rien ne compare des règles qui
    /// ne s'appellent pas.
    ///
    /// Garde NÉGATIVE : elle rougit si quelqu'un rajoute un placement média à
    /// cette politique, ce qui est la façon la plus naturelle de « compléter »
    /// une règle qu'on lit isolément.
    func test_laPolitique_neDecidePasDuMedia_carLaRegleExisteDeja() throws {
        let code = AppSourceGuard.stripComments(try politiqueSource())
        for interdit in ["forMedia", "background", "foreground"] {
            XCTAssertFalse(
                code.contains(interdit),
                "`\(interdit)` réintroduirait une seconde règle de placement média. La première "
                    + "vit dans `StoryComposerViewModel+Elements` (`shouldBeBackground`) et dans "
                    + "`ComposerAudioPlacement`."
            )
        }
    }

    private func politiqueSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // racine du dépôt
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Story/StoryPastePlacement.swift")
        let brut = try String(contentsOf: url, encoding: .utf8)
        XCTAssertGreaterThan(brut.count, 1000, "Source vide — la garde serait verte par omission.")
        return brut
    }
}
