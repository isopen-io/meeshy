import XCTest
@testable import Meeshy

/// #5036 — **le pied des références se lit AVEC la scène**, et #8370 lui rend
/// sa place naturelle.
///
/// > Directive porteur 2026-09-03 : « les hashtag et mention doivent être
/// > **directement en bas de la scene** aligné comme le son de fond de la
/// > scene ! »
///
/// Quand la carte se centrait dans une frame plus haute qu'elle, le pied
/// flottait à 77 pt sous le dessin, et une remontée mesurée (`referencesLift`)
/// comblait ce letterbox. La scène prend désormais le viewport et le chrome
/// flotte dessus : le pied est l'étage qui suit immédiatement la scène libre,
/// sans aucun vide à combler — la remontée, et son `padding` négatif, n'ont
/// plus rien à retrancher.
final class ComposerReferencesLiftTests: XCTestCase {

    private func compact() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Main/Composer/ComposerSceneSurface.swift"))
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// Le pied suit IMMÉDIATEMENT la scène libre dans le calque du chrome :
    /// ce qui QUALIFIE la scène la touche, ce qui l'OUTILLE vient après.
    func test_lePied_suitImmediatementLaSceneLibre() throws {
        let code = try compact()
        // Les étages du bas sont regroupés dans `lowerFloors` depuis le mode
        // Animé (#8415), que la frise remplace tant qu'elle est ouverte : le
        // pied reste leur PREMIER étage, juste sous la scène libre.
        XCTAssertTrue(code.contains("freeZoneiflettimelinePanel{timelinePanel}else{lowerFloors}"),
                      "Sous la scène libre : la frise, ou les étages du bas.")
        XCTAssertTrue(code.contains("privatevarlowerFloors:someView{VStack(alignment:.leading,spacing:0){ifComposerCanonicalZone.isServed(.references,toolIsOpen:toolIsOpen){ComposerSceneReferenceFooter("),
                      "Le pied des références doit être l'étage qui suit la scène libre.")
        XCTAssertFalse(code.contains("referencesLift"), "Aucune remontée : il n'y a plus de letterbox à combler.")
    }

    /// **Le pied cède toujours à un outil ouvert** (#5010). Le corps de #5036
    /// demandait l'inverse, mais il a été écrit AVANT que #5010 ne soit livré.
    ///
    /// > Le corps d'une issue est DATÉ ; le code ne l'est pas.
    func test_lePiedCèdeÀUnOutilOuvert_etLaLoiDOrdreNeLeRamènePas() {
        XCTAssertFalse(ComposerCanonicalZone.isServed(.references, toolIsOpen: true))
        XCTAssertTrue(ComposerCanonicalZone.isServed(.references, toolIsOpen: false))
    }
}
