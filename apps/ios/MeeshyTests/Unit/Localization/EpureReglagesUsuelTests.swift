import XCTest
import MeeshySDK
@testable import Meeshy

/// L'épure 1/3 des réglages (#17584, #17652) : l'usuel se nomme, le propre à Meeshy se dit.
/// Règle 1 : une initiale de jour ne désigne pas deux jours, un libellé de rangée est un nom, un statut s'accorde avec
/// « la 2FA », « Fil social » ne tronque pas ses rangées. Règle 2 : « À propos » ne redit pas la liste des
/// fonctionnalités, l'accueil du profil vocal ne redit pas « votre voix ». Règle 7 : les sections E-mail et Téléphone
/// disent à quoi sert une adresse ou un numéro vérifié, visible au repos.
@MainActor
final class EpureReglagesUsuelTests: XCTestCase {

    private static let repoRoot: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    private typealias Catalog = [String: [String: String]]

    private func app() throws -> Catalog {
        let data = try Data(contentsOf: Self.repoRoot.appendingPathComponent("apps/ios/Meeshy/Localizable.xcstrings"))
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])
        return strings.reduce(into: Catalog()) { result, entry in
            let localizations = ((entry.value as? [String: Any])?["localizations"] as? [String: Any]) ?? [:]
            result[entry.key] = localizations.reduce(into: [String: String]()) { values, locale in
                if let unit = (locale.value as? [String: Any])?["stringUnit"] as? [String: Any], let value = unit["value"] as? String {
                    values[locale.key] = value
                }
            }
        }
    }

    private func code(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: Self.repoRoot.appendingPathComponent("apps/ios/Meeshy/" + relativePath), encoding: .utf8))
    }

    private static let otherLanguages = ["en", "es", "pt-BR", "de", "it", "ar"]

    // MARK: - Notifications > Ne pas déranger > Jours

    func test_dndDays_tuesdayAndSunday_haveTheirOwnInitial_inEveryLanguage() throws {
        let app = try app()
        let expected: [String: (tue: String, sun: String)] = [
            "fr": ("M", "D"), "es": ("M", "D"), "it": ("M", "D"), "pt-BR": ("T", "D"), "ar": ("ث", "ح"),
        ]
        for (language, initials) in expected {
            XCTAssertEqual(app["common.day.tue.short"]?[language], initials.tue, "mardi [\(language)]")
            XCTAssertEqual(app["common.day.sun.short"]?[language], initials.sun, "dimanche [\(language)]")
        }
    }

    func test_dndDays_swiftDefaults_followTheFrenchInitials() throws {
        let view = try code("Features/Settings/Views/NotificationSettingsView.swift")
        XCTAssertTrue(view.contains("\"common.day.tue.short\", defaultValue: \"M\""))
        XCTAssertTrue(view.contains("\"common.day.sun.short\", defaultValue: \"D\""))
    }

    // MARK: - Notifications : rangées

    func test_notifications_bringRow_isANoun_notAnImperative() throws {
        let values = try XCTUnwrap(try app()["settings.notifications.bring"])
        for language in ["fr"] + Self.otherLanguages {
            XCTAssertEqual(values[language], "Bring", "[\(language)]")
        }
        let view = try code("Features/Settings/Views/NotificationSettingsView.swift")
        XCTAssertTrue(view.contains("\"settings.notifications.bring\", defaultValue: \"Bring\""))
        XCTAssertTrue(view.contains("settings.notifications.bring.summary"), "la phrase visible reste")
        XCTAssertTrue(view.contains("SettingsInfoNotes.bringOff"), "le (i) reste")
    }

    func test_notifications_socialFeedRows_doNotTruncateTheirObject() throws {
        let app = try app()
        XCTAssertEqual(app["settings.notifications.story_reactions"]?["fr"], "Réactions aux stories")
        XCTAssertEqual(app["settings.notifications.comment_replies"]?["fr"], "Réponses aux commentaires")
        let view = try code("Features/Settings/Views/NotificationSettingsView.swift")
        XCTAssertFalse(view.contains("defaultValue: \"Réactions stories\""))
        XCTAssertFalse(view.contains("defaultValue: \"Réponses commentaires\""))
    }

    // MARK: - 2FA : le genre de « la 2FA »

    func test_twoFactor_labels_agreeWithTheFeminine_inFrenchSpanishItalianAndPortuguese() throws {
        let app = try app()
        XCTAssertEqual(app["2fa_activated_title"]?["fr"], "2FA activée avec succès !")
        XCTAssertEqual(app["twofactor.error.disable"]?["fr"], "Impossible de désactiver la 2FA")
        XCTAssertEqual(app["twofactor.error.disable"]?["pt-BR"], "Não foi possível desativar a 2FA")
        XCTAssertEqual(app["2fa_enabled"]?["fr"], "Activée")
        XCTAssertEqual(app["2fa_disabled"]?["fr"], "Désactivée")
        XCTAssertEqual(app["2fa_enabled"]?["es"], "Activada")
        XCTAssertEqual(app["2fa_disabled"]?["es"], "Desactivada")
        XCTAssertEqual(app["2fa_enabled"]?["it"], "Attiva")
        XCTAssertEqual(app["2fa_disabled"]?["it"], "Disattivata")
        XCTAssertEqual(app["2fa_enabled"]?["pt-BR"], "Ativada")
        XCTAssertEqual(app["2fa_disabled"]?["pt-BR"], "Desativada")
    }

    func test_twoFactor_swiftDefaults_followTheFrenchWording() throws {
        XCTAssertTrue(try code("Features/Settings/Views/SecurityTwoFactorSection.swift").contains("defaultValue: \"Activée\""))
        XCTAssertTrue(try code("Features/Settings/Views/SecurityTwoFactorSection.swift").contains("defaultValue: \"Désactivée\""))
        XCTAssertTrue(try code("Features/Settings/Views/TwoFactorSetupView.swift").contains("defaultValue: \"2FA activée avec succès !\""))
        XCTAssertTrue(try code("Features/Settings/ViewModels/TwoFactorViewModel.swift").contains("defaultValue: \"Impossible de désactiver la 2FA\""))
    }

    // MARK: - Sécurité : E-mail et Téléphone disent à quoi ils servent

    func test_security_emailAndPhoneSections_carryAVisibleOrientationSentence() throws {
        let email = try code("Features/Settings/Views/SecurityEmailSection.swift")
        XCTAssertTrue(email.contains("SettingsSentence(text: String(localized: \"settings.security.email.summary\""))
        let phone = try code("Features/Settings/Views/SecurityPhoneSection.swift")
        XCTAssertTrue(phone.contains("SettingsSentence(text: String(localized: \"settings.security.phone.summary\""))
    }

    func test_security_orientationSentences_areTranslatedInSevenLanguages_andShort() throws {
        let app = try app()
        let french = [
            "settings.security.email.summary": "Vérifié, il sert à récupérer votre compte et à publier.",
            "settings.security.phone.summary": "Vérifié, il sert à récupérer votre compte par SMS.",
        ]
        for (key, text) in french {
            let values = try XCTUnwrap(app[key], key)
            XCTAssertEqual(values["fr"], text)
            XCTAssertEqual(values.count, 7, "\(key) : sept langues")
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(values[language], "\(key) [\(language)]")
                XCTAssertNotEqual(value, text, "\(key) [\(language)] : copié du français")
            }
            for (language, value) in values { XCTAssertLessThanOrEqual(value.count, 80, "\(key) [\(language)]") }
        }
    }

    // MARK: - À propos

    func test_about_header_doesNotRepeatTheFeaturesList() throws {
        let view = try code("Features/Settings/Views/AboutView.swift")
        XCTAssertFalse(view.contains("about.description.body"))
        XCTAssertNil(try app()["about.description.body"], "plus aucun lecteur : supprimée des sept langues")
    }

    // MARK: - Profil vocal : accueil

    func test_voiceWizard_intro_namesTheCloning_andKeepsTheSevenLanguages() throws {
        let values = try XCTUnwrap(try app()["voice.profile.wizard.intro"])
        XCTAssertEqual(values["fr"], "Enregistrez votre voix pour activer le clonage vocal.")
        XCTAssertEqual(values.count, 7)
        for language in Self.otherLanguages {
            let value = try XCTUnwrap(values[language], "[\(language)]")
            XCTAssertNotEqual(value, values["fr"], "[\(language)] : copié du français")
            XCTAssertLessThan(value.count, 70, "[\(language)] « \(value) »")
        }
        XCTAssertTrue(try code("Features/Settings/Views/VoiceProfileWizardView.swift").contains("defaultValue: \"Enregistrez votre voix pour activer le clonage vocal.\""))
    }

    func test_voiceWizard_consent_staysUntouched() throws {
        let app = try app()
        for key in ["voice.profile.wizard.consent.encrypted", "voice.profile.wizard.consent.rgpd", "voice.profile.wizard.consent.samples"] {
            XCTAssertEqual(app[key]?.count, 7, key)
        }
    }
}
