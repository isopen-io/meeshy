import XCTest
@testable import Meeshy
@testable import MeeshyUI

/// **Deux places, deux rôles — et c'est l'arbitrage du 2026-08-28 (#4061, `1b`).**
///
/// Le rail FLOTTE sur le bord droit, DANS la scène, et il agit **sur** elle :
/// quatre gestes qui posent ou modifient ce qui est déjà là. La rangée basse,
/// elle, fait **entrer** de la matière — photo, caméra, fichier, lieu. Les
/// fondre en un seul rail de huit icônes mélange les deux rôles et coûte la
/// rangée que le pouce atteint.
///
/// Mesuré au simulateur `Meeshy-iOS26` avant ce lot : dès qu'un fond était
/// choisi, l'app montait `ComposerSceneSurface` — **deux rails hors de la
/// scène, huit entrées à gauche, aucune rangée basse**. C'est exactement la
/// disposition que l'arbitrage a écartée, au motif qu'aucune capture ne la
/// montre.
final class ComposerSceneFloatingRailTests: XCTestCase {

    func test_leRailPorteLesQuatreGestesDeLaMaquette() {
        XCTAssertEqual(ComposerSceneFloatingRail.doors,
                       [.text, .sticker, .sound, .mention],
                       "✎ ☺ ♫ # — les quatre de la planche `1b`, dans son ordre")
    }

    /// **Le dessin n'y est PAS, et ce n'est pas un oubli.** L'arbitrage dit
    /// quatre actions ; la loi 1 dit qu'on ne retire rien. Les deux tiennent
    /// ensemble parce que le dessin FAIT ENTRER un tracé dans la scène — c'est
    /// de la matière, comme une photo — et sa place est donc la rangée basse.
    func test_leDessinNEstPasDansLeRail_ilEstDansLaRangeeBasse() {
        XCTAssertFalse(ComposerSceneFloatingRail.doors.contains(.drawing))
        XCTAssertFalse(ComposerSceneFloatingRail.doors.contains(.media))
        XCTAssertFalse(ComposerSceneFloatingRail.doors.contains(.place))
    }

    /// Le rail est un rail de SCÈNE : sans scène, il n'a rien sur quoi agir —
    /// loi 8, le prisme n'affiche que ce dont on a besoin quand on en a besoin.
    func test_sansScene_leRailNExistePas() {
        XCTAssertTrue(ComposerSceneFloatingRail.served(hasScene: false).isEmpty)
        XCTAssertFalse(ComposerSceneFloatingRail.served(hasScene: true).isEmpty)
    }

    /// **Le fusible.** Une règle qui rendrait toujours la liste vide passerait
    /// le témoin négatif ci-dessus sans rien servir.
    func test_avecUneScene_lesQuatreSontServies() {
        XCTAssertEqual(ComposerSceneFloatingRail.served(hasScene: true).count, 4)
    }

    // MARK: - Le partage des huit portes

    /// **Aucune porte ne se perd, et aucune n'est à deux places.** Le rail et
    /// la rangée forment une PARTITION du jeu servi : c'est ce qui rend le
    /// partage vérifiable plutôt que déclaratif.
    func test_leRailEtLaRangee_partagentLesPortesSansPerteNiDoublon() {
        let servies: [ComposerRailDoor] = [.description, .media, .sound, .sticker,
                                           .mention, .place, .drawing, .text]
        let rail = ComposerSceneFloatingRail.served(hasScene: true)
            .filter(servies.contains)
        let rangee = ComposerSceneFloatingRail.lowRow(from: servies)

        XCTAssertEqual(Set(rail).union(rangee), Set(servies), "aucune porte ne se perd")
        XCTAssertTrue(Set(rail).isDisjoint(with: Set(rangee)), "aucune porte à deux places")
        XCTAssertEqual(rangee, [.description, .media, .place, .drawing])
    }

    /// La rangée se DÉRIVE du jeu servi : une porte que l'hôte ne sert pas
    /// n'apparaît nulle part. Deux listes écrites à part auraient divergé au
    /// premier ajout.
    func test_unePorteNonServie_nApparaitNulle_part() {
        let rangee = ComposerSceneFloatingRail.lowRow(from: [.media, .text])
        XCTAssertEqual(rangee, [.media])
        XCTAssertFalse(rangee.contains(.drawing))
    }
}
