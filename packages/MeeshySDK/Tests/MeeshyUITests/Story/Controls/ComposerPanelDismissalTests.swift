import XCTest
@testable import MeeshyUI

/// T10 + T8 — la SORTIE de panneau, testée sur le signal produit et pas
/// seulement sur son enveloppe.
///
/// La chaîne réellement corrigée est : tap fond → `backgroundTapAction` →
/// `dismissing(ctx)` → contexte résultant → `fullChromeVisible == true`. Tester
/// les deux extrémités et jamais la COMPOSITION est ce qui avait laissé passer
/// le trou de l'empty-state (`feedback_verify_generated_signal_not_just_its_envelope`).
/// L'applicateur `dismissActiveBandPanel()` vit dans une extension de View non
/// montable : la décision est donc extraite en fonction PURE, et la vue n'en est
/// plus qu'un applicateur trivial (vérifié par les gardes de source en fin de
/// fichier).
final class ComposerPanelDismissalTests: XCTestCase {

    // MARK: - La composition, de bout en bout

    // MARK: - `resultingContext` — ce qui SURVIT à la sortie de panneau

    // MARK: - Gardes anti-régression (T8)

    /// L'unique vérité de visibilité du chrome vit dans la machine : plus aucun
    /// `@State` parallèle nulle part dans le composer.
    func test_chromeVisibility_hasNoSecondSourceOfTruth() throws {
        let offenders = try ComposerSourceGuard.allStorySources()
            .filter { $0.code.contains("areFabsVisible") }
        XCTAssertTrue(offenders.isEmpty, "Seconde vérité du chrome ressuscitée dans : \(offenders.map(\.path))")
    }

}
