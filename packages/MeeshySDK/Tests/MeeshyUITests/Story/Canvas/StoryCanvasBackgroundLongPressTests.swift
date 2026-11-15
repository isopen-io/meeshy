import XCTest
@testable import MeeshyUI

/// **L'appui long sur une image de FOND la sélectionne** (#13974, grammaire
/// d'édition I-E1 ; avant : son menu flottant, #5041).
///
/// > Décision porteur 2026-10-31 : une option d'édition n'a que trois places —
/// > le rail du bas remplacé, des rails superposés par niveaux, une feuille
/// > basse —, jamais un menu flottant.
///
/// Le geste fait ce que fait le toucher : l'hôte pose le niveau « Fond ». Le
/// viseur garde la scène qui n'a rien à éditer (#4036).
final class StoryCanvasBackgroundLongPressTests: XCTestCase {

    func test_unFondPresent_estSelectionne() {
        XCTAssertEqual(
            StoryCanvasBackgroundLongPress.outcome(backgroundMediaObjectId: "bg-42",
                                                   hostSelectsBackground: true),
            .selectBackground("bg-42"))
    }

    /// **Le viseur garde son cas** : une scène qui n'a rien à éditer.
    func test_sansFond_leViseurGardeLeGeste() {
        XCTAssertEqual(
            StoryCanvasBackgroundLongPress.outcome(backgroundMediaObjectId: nil,
                                                   hostSelectsBackground: true),
            .openViewfinder)
    }

    /// **Le témoin qui empêche le correctif d'ÉTEINDRE le geste** : sans hôte
    /// pour sélectionner le fond, l'appui long retombe sur le viseur plutôt que
    /// de ne rien faire.
    func test_sansHotePourLaSelection_leGesteRetombeSurLeViseur() {
        XCTAssertEqual(
            StoryCanvasBackgroundLongPress.outcome(backgroundMediaObjectId: "bg-42",
                                                   hostSelectsBackground: false),
            .openViewfinder,
            "un fond sans hôte pour le sélectionner ne doit JAMAIS rendre le geste muet")
    }

    /// Une chaîne VIDE n'est pas un identifiant : sélectionner un objet
    /// introuvable poserait un niveau vide.
    func test_unIdentifiantVide_neVautPasUnFond() {
        XCTAssertEqual(
            StoryCanvasBackgroundLongPress.outcome(backgroundMediaObjectId: "",
                                                   hostSelectsBackground: true),
            .openViewfinder)
    }

    /// **Un appui long n'est pas un toucher** (#13974, mesuré au simulateur) :
    /// reconnus ensemble, le toucher partait au RELÂCHEMENT et désélectionnait
    /// le fond que l'appui long venait de sélectionner — le niveau « Fond »
    /// n'apparaissait jamais.
    func test_leToucherEtLAppuiLongDuFond_sExcluent_dansLesDeuxSens() {
        let toucher = NSObject(), appui = NSObject(), autre = NSObject()
        XCTAssertTrue(StoryCanvasBackgroundLongPress.excludesEachOther(toucher, appui, tap: toucher, longPress: appui))
        XCTAssertTrue(StoryCanvasBackgroundLongPress.excludesEachOther(appui, toucher, tap: toucher, longPress: appui))
        XCTAssertFalse(StoryCanvasBackgroundLongPress.excludesEachOther(toucher, autre, tap: toucher, longPress: appui),
                       "le toucher garde ses autres gestes simultanés")
        XCTAssertFalse(StoryCanvasBackgroundLongPress.excludesEachOther(toucher, appui, tap: nil, longPress: appui))
    }
}
