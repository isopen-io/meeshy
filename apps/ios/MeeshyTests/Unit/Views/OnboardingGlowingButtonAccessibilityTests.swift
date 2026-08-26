import XCTest
@testable import Meeshy

/// `GlowingButton` est le CTA PRINCIPAL du parcours d'inscription — le bouton
/// « Continuer » / « Créer mon compte » de `OnboardingFlowView.bottomBar`,
/// posé sur chacune des huit étapes.
///
/// Son corps bascule sur `isLoading` : le `Text(title)` (et l'icône) sont
/// REMPLACÉS par un `ProgressView` seul. Or SwiftUI compose le nom accessible
/// d'un `Button` à partir de son label — le CTA devenait donc un « bouton »
/// ANONYME au moment précis où l'utilisateur attend le réseau (création de
/// compte). VoiceOver n'annonçait ni ce que fait le bouton, ni qu'il travaille ;
/// et sous Voice Control, « Appuyer sur Créer mon compte » cessait de
/// correspondre à quoi que ce soit dès que l'appel partait.
///
/// Le contrat posé : le titre est un `.accessibilityLabel` EXPLICITE — il
/// survit au basculement et reste stable pour Voice Control — et l'attente est
/// annoncée comme `.accessibilityValue`, jamais en maquillant le nom.
///
/// Garde de source, même idiome que `OnboardingRecapStepAccessibilityTests` /
/// `OnboardingLanguageStepAccessibilityTests` : la vue n'est pas montable hors
/// hôte SwiftUI, mais le contrat est lisible dans le source.
@MainActor
final class OnboardingGlowingButtonAccessibilityTests: XCTestCase {

    private func animationsSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Auth/Onboarding/OnboardingAnimations.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Le corps de `GlowingButton` seul — pour qu'une assertion ne soit pas
    /// satisfaite par un modifier appartenant à un autre composant du fichier.
    private func glowingButtonBody() throws -> String {
        let source = try animationsSource()
        guard let start = source.range(of: "struct GlowingButton: View {") else {
            XCTFail("OnboardingAnimations.swift doit définir GlowingButton"); return ""
        }
        return String(source[start.lowerBound...])
    }

    // MARK: - Le nom survit au basculement de chargement

    func test_glowingButton_carriesAnExplicitAccessibilityLabel() throws {
        let body = try glowingButtonBody()
        XCTAssertTrue(
            body.contains(".accessibilityLabel(title)"),
            "Sous `isLoading`, le label du bouton n'est plus qu'un ProgressView : sans "
            + "`.accessibilityLabel(title)` explicite, le CTA principal de l'inscription devient "
            + "un bouton ANONYME pendant l'attente réseau (WCAG 4.1.2)."
        )
    }

    func test_glowingButton_announcesTheWaitAsAValueNotAsItsName() throws {
        let body = try glowingButtonBody()
        XCTAssertTrue(
            body.contains(".accessibilityValue(isLoading ? Self.loadingAccessibilityValue : \"\")"),
            "L'attente doit être annoncée comme VALEUR : le NOM doit rester le titre, sans quoi "
            + "la commande Voice Control « Appuyer sur <titre> » cesse de correspondre dès que "
            + "l'appel réseau part."
        )
    }

    // MARK: - L'annonce d'attente est localisée, sans clé neuve

    func test_loadingValue_reusesTheExistingLocalizedKey() throws {
        let body = try glowingButtonBody()
        XCTAssertTrue(
            body.contains("\"loading.message\""),
            "L'annonce d'attente doit réutiliser la clé `loading.message`, déjà traduite dans "
            + "les 7 locales livrées — aucune clé neuve pour un état aussi générique."
        )
    }

    /// Le libellé d'attente est réellement servi, et localisé — pas une chaîne
    /// vide ni la clé brute qui fuirait dans l'annonce VoiceOver.
    func test_loadingValue_resolvesToNonEmptyLocalizedText() {
        let value = GlowingButton.loadingAccessibilityValue
        XCTAssertFalse(value.isEmpty, "l'annonce d'attente ne doit pas être vide")
        XCTAssertNotEqual(
            value, "loading.message",
            "la clé brute ne doit jamais fuir dans l'annonce — signe d'une entrée catalogue absente"
        )
    }
}
