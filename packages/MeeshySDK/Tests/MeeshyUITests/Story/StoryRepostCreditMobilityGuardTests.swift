import XCTest
@testable import MeeshyUI

/// **La pastille de crédit se DÉPLACE** (directive porteur 2026-09-01) — et le
/// verrou qui la protège ne doit jamais s'y opposer.
///
/// > « le chip de crédit […] on doit pouvoir le mouvoir »
///
/// Le verrou (`StoryTextObject.isLocked`) est la garantie qu'un republieur ne
/// peut pas RETIRER l'attribution : il ferme l'édition, la duplication, la
/// suppression, la sortie de scène. Il ne ferme PAS la position — un crédit
/// qu'on ne peut pas écarter du visage d'un sujet est un crédit qu'on
/// n'accepte pas.
///
/// Gardes NÉGATIVES : elles rougissent si un futur correctif ajoute le verrou
/// sur un chemin de MOUVEMENT. Un doc-comment de `+Repost.swift` affirmait
/// justement que le composer « skips drag » pour un objet verrouillé — c'était
/// faux, et personne ne l'avait mesuré ; ces témoins font que l'affirmation
/// inverse, elle, se vérifie.
final class StoryRepostCreditMobilityGuardTests: XCTestCase {

    private func canvasSource(_ nom: String) throws -> String {
        let url = ComposerSourceGuard.packageRoot
            .appendingPathComponent("Sources/MeeshyUI/Story/Canvas/\(nom)")
        return ComposerSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func corps(_ ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre) else { return nil }
        var profondeur = 0
        var resultat = ""
        for caractere in code[debut.lowerBound...] {
            resultat.append(caractere)
            if caractere == "{" { profondeur += 1 }
            if caractere == "}" {
                profondeur -= 1
                if profondeur == 0 { return resultat }
            }
        }
        return nil
    }

    /// Le geste de glissement ne consulte pas le verrou.
    func test_leGesteDeGlissement_neConsultePasLeVerrou() throws {
        let code = try canvasSource("StoryCanvasUIView+Gestures.swift")
        guard let pan = corps("@objc func handlePan(_ recognizer: UIPanGestureRecognizer) {",
                              dans: code) else {
            return XCTFail("`handlePan` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertFalse(
            pan.contains("isLocked"),
            "`handlePan` s'est mis à consulter le verrou : la pastille de crédit ne se déplacerait "
                + "plus, alors que la directive du 2026-09-01 le demande explicitement."
        )
    }

    /// L'écriture de la position non plus — c'est elle qui CONCLUT le geste.
    func test_lÉcritureDeLaPosition_neConsultePasLeVerrou() throws {
        let code = try canvasSource("StoryCanvasUIView+Manipulation.swift")
        guard let ecriture = corps("func updatePosition(slideId: String, x: Double, y: Double) -> StorySlide {",
                                   dans: code) else {
            return XCTFail("`updatePosition` introuvable.")
        }
        XCTAssertFalse(ecriture.contains("isLocked"),
                       "Poser le verrou ici figerait la pastille APRÈS le geste — pire qu'un refus, "
                           + "puisque le doigt aurait déjà bougé le dessin.")
    }

    /// **Contre-épreuve : le verrou est bien LÀ où il doit être.** Sans elle,
    /// les deux gardes ci-dessus resteraient vertes si `isLocked` disparaissait
    /// entièrement — c'est-à-dire si l'attribution devenait retirable.
    func test_leVerrou_ferme_toujours_leRETRAIT() throws {
        let code = try canvasSource("StoryCanvasUIView+Manipulation.swift")
        for ancre in ["func deleteItem(id: String) {", "func duplicateItem(id: String) {"] {
            guard let bloc = corps(ancre, dans: code) else {
                return XCTFail("`\(ancre)` introuvable.")
            }
            XCTAssertTrue(bloc.contains("isLockedItem(id: id)"),
                          "`\(ancre)` doit refuser un objet verrouillé — c'est ce qui garantit "
                              + "qu'un republieur ne peut pas effacer l'attribution.")
        }
    }
}
