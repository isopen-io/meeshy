import XCTest
@testable import MeeshyUI

/// **L'appui long sur une image de FOND ouvre son menu** (#5041).
///
/// > Directive porteur 2026-09-04 : « Lorsqu'on a une image, vidéo de fond le
/// > longpress sur le fond doit mettre le menu permettant de supprimer, ramener
/// > en front ou encore d'editer l'image ».
///
/// Le rappel s'appelait `onBackgroundLongPressed` et son contrat disait « scène
/// VIDE » (#4036) ; la garde qui le déclenchait mesurait `hitTestItem == nil`,
/// c'est-à-dire « aucun objet de PREMIER PLAN ». Un média de fond ne vit pas
/// dans `itemsContainer` : la slide la plus chargée pouvait donc passer pour
/// vide, et le geste ouvrait le viseur au lieu du menu.
final class StoryCanvasBackgroundLongPressTests: XCTestCase {

    /// Le cas qui a fait naître ce lot.
    func test_unFondPresent_ouvreSonMenu() {
        XCTAssertEqual(
            StoryCanvasBackgroundLongPress.outcome(backgroundMediaObjectId: "bg-42",
                                                   hostServesBackgroundMenu: true),
            .presentBackgroundMenu("bg-42"))
    }

    /// **Le viseur garde son cas**, celui pour lequel le #4036 l'a écrit : une
    /// scène qui n'a rien à éditer. Cette règle ne lui retire rien, elle lui rend
    /// sa définition.
    func test_sansFond_leViseurGardeLeGeste() {
        XCTAssertEqual(
            StoryCanvasBackgroundLongPress.outcome(backgroundMediaObjectId: nil,
                                                   hostServesBackgroundMenu: true),
            .openViewfinder)
    }

    /// **Le témoin qui empêche le correctif d'ÉTEINDRE le geste.**
    ///
    /// Router vers un menu que personne ne monte rendrait l'appui long muet —
    /// strictement pire que le défaut corrigé, puisqu'il ouvrait au moins le
    /// viseur. La présence de l'hôte est donc un FAIT que la règle lit, pas une
    /// promesse tenue ailleurs.
    ///
    /// C'est aussi le choix de la DIRECTION de l'erreur par son coût de
    /// réparation : « viseur alors qu'on voulait éditer » coûte un appui de
    /// plus ; « rien ne se passe » se diagnostique en heures.
    func test_sansHotePourLeMenu_leGesteRetombeSurLeViseur() {
        XCTAssertEqual(
            StoryCanvasBackgroundLongPress.outcome(backgroundMediaObjectId: "bg-42",
                                                   hostServesBackgroundMenu: false),
            .openViewfinder,
            "un fond sans hôte pour le présenter ne doit JAMAIS rendre le geste muet")
    }

    /// Une chaîne VIDE n'est pas un identifiant. Sans ce cas, un fond mal
    /// initialisé enverrait l'hôte présenter un menu sur un objet introuvable —
    /// un menu vide plutôt qu'un viseur, ce qui est pire que le défaut corrigé.
    func test_unIdentifiantVide_neVautPasUnFond() {
        XCTAssertEqual(
            StoryCanvasBackgroundLongPress.outcome(backgroundMediaObjectId: "",
                                                   hostServesBackgroundMenu: true),
            .openViewfinder)
    }
}
