import XCTest
@testable import Meeshy

/// I-075 (amendement produit 2026-08-16, point 3) — la bascule « Activer les
/// bêta » dans les réglages de l'app. §0 re-preuve : l'écran de réglages vit
/// dans `SettingsView.swift` (`apps/ios/Meeshy/Features/Main/Views/`) —
/// re-prouvé par lecture de source avant d'y ajouter la section.
///
/// Ce fichier ne construit pas `SettingsView` (pas de toolchain Swift sous
/// Linux, R5) : preuves par lecture de source, patron des autres gardes de
/// ce lot, chaque assertion portant un message écrit pour le lecteur du run
/// CI distant (leçon 265).
final class BetaFeaturesSettingsSourceGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/SettingsView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - La section existe et est montée

    /// Tous les builds, aucun `#if DEBUG` — c'est une publication bêta
    /// publique, plus un outil de développement (amendement produit).
    func test_betaSection_isMountedUnconditionally_noDebugGate() throws {
        let code = try source()
        guard let sectionRange = code.range(of: "private var betaSection: some View {") else {
            XCTFail("betaSection introuvable dans SettingsView.swift — la section « Bêta » a-t-elle été renommée ou retirée ?")
            return
        }
        guard let mountRange = code.range(of: "betaSection\n") ?? code.range(of: "betaSection\r\n") else {
            XCTFail("`betaSection` n'est référencée nulle part ailleurs dans SettingsView.swift — la section est déclarée mais jamais montée dans scrollContent.")
            return
        }
        XCTAssertTrue(mountRange.lowerBound < sectionRange.lowerBound, "Le site de montage de betaSection doit précéder sa déclaration dans le fichier (ordre du VStack de scrollContent, avant les MARK des sections individuelles).")

        // Garde « aucun #if DEBUG » autour du site de montage OU de la
        // déclaration : fenêtre large des deux côtés.
        let mountWindowStart = code.index(mountRange.lowerBound, offsetBy: -200, limitedBy: code.startIndex) ?? code.startIndex
        let mountWindow = code[mountWindowStart..<mountRange.upperBound]
        XCTAssertFalse(
            mountWindow.contains("#if DEBUG"),
            "Le montage de betaSection ne doit PAS être gardé par #if DEBUG — publication bêta PUBLIQUE, visible dans tous les builds (amendement produit 2026-08-16)."
        )
    }

    // MARK: - Le toggle lit et écrit BetaFeaturesPreference

    func test_betaFeaturesEnabledState_initializedFromBetaFeaturesPreference() throws {
        let code = try source()
        XCTAssertTrue(
            code.contains("@State private var betaFeaturesEnabled: Bool = BetaFeaturesPreference.isEnabled"),
            "L'état local du toggle doit être initialisé depuis BetaFeaturesPreference.isEnabled (lecture au rendu, comme le reste du design) — sinon le toggle afficherait toujours son état par défaut Swift (false), jamais le vrai état ON par défaut."
        )
    }

    /// Écriture au changement : le toggle appelle `BetaFeaturesPreference
    /// .setEnabled` — préférence de plein droit, PAS `setForDebug`
    /// (mécanisme réservé aux drapeaux de développement, remplacé ici).
    func test_betaToggle_writesThroughBetaFeaturesPreferenceSetEnabled() throws {
        let code = try source()
        guard let toggleRange = code.range(of: "Toggle(\"\", isOn: Binding(\n                        get: { betaFeaturesEnabled },") else {
            XCTFail("Le Toggle de betaSection est introuvable ou a changé de forme (get: { betaFeaturesEnabled }) — la garde ci-dessous ne peut pas localiser sa fenêtre d'écriture.")
            return
        }
        let windowEnd = code.index(toggleRange.upperBound, offsetBy: 200, limitedBy: code.endIndex) ?? code.endIndex
        let window = code[toggleRange.upperBound..<windowEnd]
        XCTAssertTrue(
            window.contains("BetaFeaturesPreference.setEnabled(val)"),
            "Le `set:` du Binding doit appeler BetaFeaturesPreference.setEnabled(val) — sinon le toggle change l'affichage local sans jamais persister le choix (perdu à la relance de l'app)."
        )
        XCTAssertFalse(
            window.contains("setForDebug"),
            "Le toggle des réglages ne doit JAMAIS appeler LentilleFeatureFlag.setForDebug — cette préférence est de PLEIN DROIT (amendement produit), pas une bascule de développement cachée."
        )
    }

    // MARK: - i18n : les trois clés existent, aucun littéral en dur

    func test_betaSection_usesTheThreeLocalizedKeys() throws {
        let code = try source()
        for key in ["settings.section.beta", "settings.beta.toggle", "settings.beta.toggle.subtitle"] {
            XCTAssertTrue(
                code.contains("String(localized: \"\(key)\""),
                "SettingsView.swift doit appeler String(localized: \"\(key)\", …) — clé i18n manquante ou mal orthographiée."
            )
        }
    }
}
