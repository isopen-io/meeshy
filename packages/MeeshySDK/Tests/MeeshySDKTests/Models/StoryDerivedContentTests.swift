import XCTest
@testable import MeeshySDK

/// **#4502 — le texte d'une story se lit DEUX fois.**
///
/// Mesuré au simulateur le 2026-09-02, chaîne complète : une story composée
/// d'un seul objet texte se restitue avec ce texte au centre du canvas **et**
/// répété en légende sous le canvas. Aucune description n'avait été saisie.
///
/// ## La cause n'est pas dans le client
///
/// C'est la passerelle qui écrit `content`, et son intention est explicite —
/// `services/gateway/src/services/posts/storyContentComposition.ts` :
///
/// > « Une story faite d'overlays n'a pas de légende : son `content` n'existe
/// > que comme **index de recherche**, produit par la concaténation des
/// > `textObjects`. »
///
/// Le fichier porte même le discriminant, `isContentDerivedFromTextObjects`,
/// dont le doc-comment pose exactement la bonne question : *« le `content`
/// est-il l'index dérivé des overlays, ou une vraie légende ? »*
///
/// **Deux valeurs correctement calculées, jamais consultées ensemble** — le
/// serveur produit l'index ET le moyen de le reconnaître, le lecteur ne lit
/// que l'index. C'est la forme de la leçon 419, une couche plus loin.
///
/// ## Pourquoi le test porte sur l'ORIGINAL
///
/// La passerelle compose aussi l'index dans chaque langue
/// (`composeStoryContentForLanguage`), qui atterrit dans `translations`. Un
/// lecteur qui comparerait le contenu RÉSOLU — donc traduit — à la
/// concaténation des textes ORIGINAUX conclurait « ce n'est pas un index » dès
/// que le lecteur n'est pas dans la langue d'écriture, et la légende
/// reparaîtrait. **On décide sur l'original, on rend le résolu.**
final class StoryDerivedContentTests: XCTestCase {

    // MARK: - Reconnaître l'index

    func test_leContenu_egalALaConcatenation_estUnIndex() {
        XCTAssertTrue(StoryDerivedContent.isDerivedIndex(
            content: "Bonjour le monde",
            overlayTexts: ["Bonjour", "le monde"]))
    }

    func test_unSeulOverlay_estAussiUnIndex() {
        XCTAssertTrue(StoryDerivedContent.isDerivedIndex(
            content: "Sonde publication 4842",
            overlayTexts: ["Sonde publication 4842"]))
    }

    /// **Le cas qui compte le plus** : une légende ÉCRITE reste une source à
    /// part entière. La rater ferait disparaître le texte que l'auteur a
    /// délibérément posé — un défaut pire que celui qu'on corrige.
    func test_uneLegendeECRITE_nEstPasUnIndex() {
        XCTAssertFalse(StoryDerivedContent.isDerivedIndex(
            content: "Vue depuis le refuge",
            overlayTexts: ["Bonjour", "le monde"]))
    }

    /// Une légende qui CONTIENT l'index sans lui être égale reste une légende.
    /// Le test est d'ÉGALITÉ, jamais d'inclusion : « Bonjour le monde entier »
    /// est du texte que l'auteur a écrit.
    func test_uneLegendeQuiCommenceParLIndex_resteUneLegende() {
        XCTAssertFalse(StoryDerivedContent.isDerivedIndex(
            content: "Bonjour le monde entier",
            overlayTexts: ["Bonjour", "le monde"]))
    }

    /// Les espaces de bord ne décident de rien : la passerelle compose sans
    /// eux, un contenu qui n'en diffère que par là est le même index.
    func test_lesEspacesDeBord_neChangentPasLeVerdict() {
        XCTAssertTrue(StoryDerivedContent.isDerivedIndex(
            content: "  Bonjour le monde  ",
            overlayTexts: ["Bonjour", "le monde"]))
    }

    // MARK: - Les absences

    /// Aucun overlay ⇒ il n'y a pas d'index possible, donc tout contenu est une
    /// légende. C'est le cas d'une story-photo légendée, le plus courant.
    func test_sansOverlay_toutContenu_estUneLegende() {
        XCTAssertFalse(StoryDerivedContent.isDerivedIndex(
            content: "Vue depuis le refuge", overlayTexts: []))
    }

    /// Pas de contenu ⇒ rien à qualifier. Le verdict est `false` parce qu'il
    /// répond à « faut-il TAIRE ce contenu ? », et taire le vide n'a pas de
    /// sens.
    func test_sansContenu_iln_yA_rienAQualifier() {
        XCTAssertFalse(StoryDerivedContent.isDerivedIndex(content: nil, overlayTexts: ["a"]))
        XCTAssertFalse(StoryDerivedContent.isDerivedIndex(content: "", overlayTexts: ["a"]))
        XCTAssertFalse(StoryDerivedContent.isDerivedIndex(content: "   ", overlayTexts: ["a"]))
    }

    /// Des overlays VIDES ne composent pas d'index — un objet texte qu'on
    /// vient de poser et qu'on n'a pas encore rempli ne doit pas faire taire
    /// une légende.
    func test_desOverlaysVides_neComposentAucunIndex() {
        XCTAssertFalse(StoryDerivedContent.isDerivedIndex(
            content: "Vue depuis le refuge", overlayTexts: ["", "  "]))
    }

    // MARK: - La légende à SERVIR

    /// L'usage réel du lecteur : ce qu'il rend sous le canvas.
    func test_laLegendeServie_estNulleQuandLeContenuEstUnIndex() {
        XCTAssertNil(StoryDerivedContent.caption(original: "Bonjour le monde",
                                                 resolved: "Hello world",
                                                 overlayTexts: ["Bonjour", "le monde"]))
    }

    /// **On décide sur l'ORIGINAL, on rend le RÉSOLU.** Le témoin le prouve
    /// avec deux chaînes différentes : si la règle décidait sur le résolu, elle
    /// laisserait passer l'index traduit — le défaut exact, une langue plus
    /// loin.
    func test_uneLegendeECRITE_estServieDansLaLangueRESOLUE() {
        XCTAssertEqual(StoryDerivedContent.caption(original: "Vue depuis le refuge",
                                                   resolved: "View from the hut",
                                                   overlayTexts: ["Bonjour"]),
                       "View from the hut")
    }

    /// Un résolu vide ne se rend pas : un contrôle sans matière est absent.
    func test_unResoluVide_neSeRendPas() {
        XCTAssertNil(StoryDerivedContent.caption(original: "Vue", resolved: "  ",
                                                 overlayTexts: []))
        XCTAssertNil(StoryDerivedContent.caption(original: "Vue", resolved: nil,
                                                 overlayTexts: []))
    }

    // MARK: - La composition, miroir de la passerelle

    func test_laComposition_joint_parUnSeulEspace() {
        XCTAssertEqual(StoryDerivedContent.composed(["Bonjour", "le monde"]),
                       "Bonjour le monde")
    }

    /// Les overlays vides sont ÉCARTÉS, comme le fait
    /// `composeStoryContent` — sans quoi la concaténation porterait des
    /// séparateurs en trop et ne serait jamais égale au contenu servi.
    func test_laComposition_ecarteLesOverlaysVides() {
        XCTAssertEqual(StoryDerivedContent.composed(["Bonjour", "", "  ", "le monde"]),
                       "Bonjour le monde")
        XCTAssertEqual(StoryDerivedContent.composed([]), "")
    }
}
