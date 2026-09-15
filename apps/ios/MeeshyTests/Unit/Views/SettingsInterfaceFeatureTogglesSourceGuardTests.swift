import XCTest
@testable import Meeshy

/// Sortie de bêta (directive porteur du 2026-09-14, #6482) — « Activer la liste
/// Lentille », « Activer le mode de lecture » et « Activer le mode Rivière »
/// vivent dans la section Apparence des Réglages, sous « Langue de
/// l'interface ». La section « Bêta » et sa préférence ont disparu.
///
/// Preuves par lecture de source : `SettingsView` ne se construit pas hors
/// d'un environnement complet (Router, AuthManager). Le comportement des
/// drapeaux eux-mêmes est prouvé par `LentilleFlagGateTests` et
/// `ReadingModesFlagIntegrationTests`.
final class SettingsInterfaceFeatureTogglesSourceGuardTests: XCTestCase {

    private static var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
    }

    private func code(_ relativePath: String) throws -> String {
        let raw = try String(contentsOf: Self.appRoot.appendingPathComponent(relativePath), encoding: .utf8)
        return AppSourceGuard.stripComments(raw)
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
            .replacingOccurrences(of: "( ", with: "(")
            .replacingOccurrences(of: " )", with: ")")
    }

    private func settingsCode() throws -> String {
        try code("Features/Main/Views/SettingsView.swift")
    }

    // MARK: - La bêta a disparu

    func test_settings_hasNoBetaSectionLeft() throws {
        let settings = try settingsCode()
        for leftover in ["betaSection", "betaFeaturesList", "BetaFeaturesPreference", "settings.section.beta", "settings.beta."] {
            XCTAssertFalse(settings.contains(leftover), "SettingsView contient encore « \(leftover) » — la section Bêta doit avoir disparu (#6482).")
        }
    }

    func test_retiredBetaPreferenceType_isReferencedNowhereInTheApp() throws {
        let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: Self.appRoot, includingPropertiesForKeys: nil))
        var scanned = 0
        var offenders: [String] = []
        while let url = enumerator.nextObject() as? URL {
            guard url.pathExtension == "swift" else { continue }
            scanned += 1
            let stripped = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            if stripped.contains("BetaFeaturesPreference") {
                offenders.append(url.lastPathComponent)
            }
        }
        XCTAssertGreaterThan(scanned, 100, "Le balayage n'a presque rien lu — chemin de scan à vérifier.")
        XCTAssertEqual(offenders, [], "`BetaFeaturesPreference` a été retiré (#6482) : aucun code ne doit plus le citer.")
    }

    func test_launch_removesTheRetiredBetaKey() throws {
        XCTAssertTrue(
            try code("MeeshyApp.swift").contains("LentilleFeatureFlag.removeRetiredBetaPreference()"),
            "Le lancement doit retirer la clé morte `meeshy.pref.beta_features_enabled` (#6482)."
        )
    }

    // MARK: - Les trois interrupteurs, sous « Langue de l'interface »

    func test_featureToggles_areMountedInTheAppearanceSection_underTheInterfaceLanguageRow() throws {
        let settings = try settingsCode()
        let start = try XCTUnwrap(settings.range(of: "private var appearanceSection: some View {"), "appearanceSection introuvable.")
        let end = try XCTUnwrap(
            settings.range(of: "private func themeLabel(", range: start.upperBound..<settings.endIndex),
            "La fin de appearanceSection (themeLabel) est introuvable."
        )
        let body = settings[start.upperBound..<end.lowerBound]
        let language = try XCTUnwrap(body.range(of: "interfaceLanguageRow"), "La rangée « Langue de l'interface » a quitté la section Apparence.")
        let toggles = try XCTUnwrap(body.range(of: "interfaceFeatureRows"), "Les trois interrupteurs ne sont pas montés dans la section Apparence.")
        XCTAssertLessThan(language.lowerBound, toggles.lowerBound, "Les interrupteurs se placent SOUS la rangée de langue.")
        XCTAssertFalse(body.contains("#if"), "Aucune compilation conditionnelle : les réglages sont publics.")
    }

    func test_eachToggleMirrorsItsFlag_andWritesThroughSetEnabled() throws {
        let settings = try settingsCode()
        for (state, accessor) in [
            ("lentilleListEnabled", "isLentilleListEnabled"),
            ("readingModesEnabled", "isReadingModesEnabled"),
            ("riviereModeEnabled", "isRiviereModeEnabled"),
        ] {
            XCTAssertTrue(
                settings.contains("@State private var \(state): Bool = LentilleFeatureFlag.\(accessor)"),
                "Le miroir `\(state)` doit naître de `LentilleFeatureFlag.\(accessor)` — sinon l'interrupteur affiche un état qu'il n'applique pas."
            )
        }
        for (flag, state) in [("lentilleList", "lentilleListEnabled"), ("readingModes", "readingModesEnabled"), ("riviereMode", "riviereModeEnabled")] {
            XCTAssertTrue(
                settings.contains("featureToggle(.\(flag), title: \(flag)Title, isOn: $\(state))"),
                "L'interrupteur de `.\(flag)` doit être lié à `$\(state)`."
            )
        }
        XCTAssertTrue(settings.contains("LentilleFeatureFlag.setEnabled(flag, enabled: value)"), "Chaque bascule persiste par `LentilleFeatureFlag.setEnabled`.")
        XCTAssertFalse(settings.contains("setForDebug"), "Les Réglages n'écrivent jamais par `setForDebug`, réservé aux outils.")
    }

    func test_riverToggle_isDisabledWhileReadingModesAreOff_andSaysWhy() throws {
        let settings = try settingsCode()
        let river = try XCTUnwrap(settings.range(of: "featureToggle(.riviereMode,"), "Interrupteur Rivière introuvable.")
        let helper = try XCTUnwrap(settings.range(of: "private func featureToggle("), "Fabrique d'interrupteur introuvable.")
        let riverRow = settings[river.upperBound..<helper.lowerBound]
        XCTAssertTrue(riverRow.contains(".disabled(!readingModesEnabled)"), "La Rivière est un mode de lecture : sa rangée se désactive quand ils sont coupés.")
        XCTAssertTrue(riverRow.contains("settings.interface.riviere_mode.hint"), "La rangée désactivée dit POURQUOI (indice d'accessibilité).")
    }

    func test_toggles_useTheirLocalizedKeys() throws {
        let settings = try settingsCode()
        for key in [
            "settings.interface.lentille_list",
            "settings.interface.reading_modes",
            "settings.interface.reading_modes.subtitle",
            "settings.interface.riviere_mode",
            "settings.interface.riviere_mode.hint",
        ] {
            XCTAssertTrue(settings.contains("String(localized: \"\(key)\""), "Clé « \(key) » absente de SettingsView.")
        }
    }

    // MARK: - La liste n'offre pas de modes qui s'ouvriraient ignorés

    func test_listReadingModeSubmenu_isOfferedOnlyWhenReadingModesAreOn() throws {
        XCTAssertTrue(
            try code("Features/Main/Views/ConversationListView+Overlays.swift")
                .contains("if LentilleFeatureFlag.isLentilleListEnabled, LentilleFeatureFlag.isReadingModesEnabled { LentilleReadingModeSubmenu("),
            "Modes de lecture coupés ⇒ le menu contextuel de la liste ne propose pas un mode que l'ouverture ignorerait."
        )
    }

    func test_lentilleModePill_isMountedOnlyWhenReadingModesAreOn() throws {
        XCTAssertTrue(
            try code("Features/Main/Lentille/Row/LentilleConversationRow.swift")
                .contains("if LentilleFeatureFlag.isReadingModesEnabled { LentilleModePill("),
            "Modes de lecture coupés ⇒ la rangée magnifiée ne porte pas d'encoche de mode."
        )
    }
}
