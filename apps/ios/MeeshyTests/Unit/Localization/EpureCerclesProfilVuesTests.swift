import XCTest
import MeeshySDK
@testable import Meeshy

/// L'épure 2/3 (#17584, #18088) : la fiche du participant porte le verbe en titre et des noms en rangées (règle 3), l'assistant
/// du profil vocal dit « Actif » comme l'écran de gestion (règle 6), la création d'une communauté dit « Sur invitation » /
/// « Ouverte à tous » comme ses réglages (règle 6). Les textes se testent dans les catalogues, les vues par leur source.
@MainActor
final class EpureCerclesProfilVuesTests: XCTestCase {

    private static let repoRoot: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    private typealias Catalog = [String: [String: String]]

    private static func catalog(_ path: String) throws -> Catalog {
        let data = try Data(contentsOf: repoRoot.appendingPathComponent(path))
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

    private func app() throws -> Catalog { try Self.catalog("apps/ios/Meeshy/Localizable.xcstrings") }
    private func ui() throws -> Catalog { try Self.catalog("packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings") }

    private func appCode(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: Self.repoRoot.appendingPathComponent("apps/ios/Meeshy/" + relativePath), encoding: .utf8))
    }

    private func uiCode(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: Self.repoRoot.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/" + relativePath), encoding: .utf8))
    }

    private static let otherLanguages = ["en", "es", "pt-BR", "de", "it", "ar"]
    private static let sheet = "Features/Profile/Views/ParticipantProfileSheet.swift"

    private static let capabilities = ["canViewHistory", "canSendMessages", "canSendImages", "canSendFiles", "canSendVideos", "canSendAudios", "canSendLinks", "canSendLocations"]

    private static let participantFrench: [String: String] = [
        "participantProfile.capabilities.cannot": "Ne peut pas",
        "participantProfile.capabilities.allow": "Autoriser",
        "participantProfile.capability.canSendMessages": "Écrire",
        "participantProfile.capability.canSendImages": "Photos",
        "participantProfile.capability.canSendFiles": "Fichiers",
        "participantProfile.capability.canSendVideos": "Vidéos",
        "participantProfile.capability.canSendAudios": "Audio",
        "participantProfile.capability.canSendLinks": "Liens",
        "participantProfile.capability.canSendLocations": "Position",
        "participantProfile.capability.canViewHistory": "Historique avant son arrivée",
    ]

    // MARK: - 1. Fiche du participant : le titre porte le verbe, les rangées sont des noms

    func test_participantCatalog_titlesCarryTheVerb_rowsAreNouns() throws {
        let app = try app()
        for (key, expected) in Self.participantFrench { XCTAssertEqual(app[key]?["fr"], expected, key) }
    }

    func test_participantCatalog_isTranslatedInTheSixOtherLanguages_exceptSharedCognates() throws {
        let app = try app()
        let cognates: Set<String> = ["participantProfile.capability.canSendAudios", "participantProfile.capability.canSendImages", "participantProfile.capability.canSendLinks", "participantProfile.capability.canSendVideos"]
        for key in Self.participantFrench.keys {
            let values = app[key] ?? [:]
            let french = try XCTUnwrap(values["fr"], key)
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(values[language], "\(key) [\(language)]")
                XCTAssertFalse(value.isEmpty, "\(key) [\(language)]")
                if !cognates.contains(key) { XCTAssertNotEqual(value, french, "\(key) [\(language)] : copié du français") }
            }
        }
    }

    func test_participantCatalog_oldVerbRowsHaveNoReaderLeft_inAnyLanguage() throws {
        let app = try app()
        let source = try appCode(Self.sheet)
        for capability in Self.capabilities {
            for family in ["allowed", "denied"] {
                let key = "participantProfile.\(family).\(capability)"
                XCTAssertNil(app[key], "\(key) : clé sans lecteur, à supprimer des sept langues")
                XCTAssertFalse(source.contains(key), key)
            }
        }
    }

    func test_participantSheet_readsOneNounPerCapability_inReadAndEditMode() throws {
        let source = try appCode(Self.sheet)
        for capability in Self.capabilities {
            XCTAssertTrue(source.contains("participantProfile.capability.\(capability)"), capability)
        }
        XCTAssertTrue(source.contains("participantProfile.capabilities.cannot"))
        XCTAssertTrue(source.contains("participantProfile.capabilities.allow"))
        XCTAssertFalse(source.contains("allowedLabel(") || source.contains("deniedLabel("), "un seul mot par capacité, en lecture comme en édition")
    }

    func test_participantSheet_noRestrictionKeepsItsTitleAndLine() throws {
        let source = try appCode(Self.sheet)
        XCTAssertTrue(source.contains("participantProfile.capabilities\""), "« Dans cette conversation » reste pour « Aucune restriction »")
        XCTAssertTrue(source.contains("participantProfile.noRestriction"))
        XCTAssertEqual(try app()["participantProfile.noRestriction"]?["fr"], "Aucune restriction")
    }

    func test_participantSheet_listStaysVisibleAtRest_noDisclosureHidesIt() throws {
        let source = try appCode(Self.sheet)
        XCTAssertTrue(source.contains("participant-profile-denied-"))
        XCTAssertFalse(source.contains("DisclosureGroup"))
    }

    // MARK: - 2. Profil vocal : « Actif » sur l'assistant comme sur la gestion

    func test_voiceWizard_statusRow_readsTheTranslatedLabel_notTheRawEnumValue() throws {
        let wizard = try appCode("Features/Settings/Views/VoiceProfileWizardView.swift")
        XCTAssertFalse(wizard.contains("status.rawValue.capitalized"))
        XCTAssertTrue(wizard.contains("profile.status.displayLabel"))
    }

    func test_voiceStatus_displayLabel_isTheSameWordOnWizardAndManage() throws {
        let manage = try appCode("Features/Settings/Views/VoiceProfileManageView.swift")
        XCTAssertTrue(manage.contains("extension VoiceProfileStatus"))
        XCTAssertTrue(manage.contains("status.displayLabel"))
        let app = try app()
        XCTAssertEqual(app["voice.profile.status.ready.label"]?["fr"], "Actif")
        for status in VoiceProfileStatus.allCases {
            let key = "voice.profile.status.\(status.rawValue).label"
            for language in ["fr"] + Self.otherLanguages {
                XCTAssertFalse((app[key]?[language] ?? "").isEmpty, "\(key) [\(language)]")
            }
        }
    }

    // MARK: - 3. Création d'une communauté : les mots des réglages

    func test_communityCreate_privacyRow_saysTheSettingsWords() throws {
        let create = try uiCode("Community/CommunityCreateScreen.swift")
        XCTAssertTrue(create.contains("community.settings.privacy.byInvitation"))
        XCTAssertTrue(create.contains("community.settings.privacy.openToAll"))
        XCTAssertFalse(create.contains("community.create.privacy.private.description"))
        XCTAssertFalse(create.contains("community.create.privacy.public.description"))
    }

    func test_communityCatalog_createPrivacyDescriptions_areDeletedFromAllLanguages() throws {
        let ui = try ui()
        XCTAssertNil(ui["community.create.privacy.private.description"])
        XCTAssertNil(ui["community.create.privacy.public.description"])
        XCTAssertEqual(ui["community.settings.privacy.byInvitation"]?["fr"], "Sur invitation")
        XCTAssertEqual(ui["community.settings.privacy.openToAll"]?["fr"], "Ouverte à tous")
    }

    func test_communityCreate_privateStateStaysSaidByHeaderBadge_andConfirmation() throws {
        let create = try uiCode("Community/CommunityCreateScreen.swift")
        XCTAssertTrue(create.contains("community.privacy.private"))
        XCTAssertNotNil(try ui()["community.settings.privacy.confirm.title"]?["fr"])
    }

    // MARK: - 4. Fin de l'assistant vocal : le titre porte le résultat, rien ne le répète (règle 2)

    func test_voiceWizard_successScreen_doesNotRepeatWhatTheRestingScreensAlreadySay() throws {
        let wizard = try appCode("Features/Settings/Views/VoiceProfileWizardView.swift")
        XCTAssertFalse(wizard.contains("voice.profile.wizard.success.message"))
    }

    func test_voiceCatalog_successMessage_isDeletedFromAllLanguages() throws {
        XCTAssertNil(try app()["voice.profile.wizard.success.message"])
    }

    // MARK: - 5. Ajoute ton numéro : la phrase de bénéfice reste, courte (règles 1 et 7)

    func test_phonePrompt_benefit_isOneShortSentenceInSevenLanguages() throws {
        let benefit = try XCTUnwrap(try app()["contacts.phonePrompt.benefit"])
        XCTAssertEqual(benefit["fr"], "Tes proches te retrouvent grâce à ton numéro.")
        for language in ["fr"] + Self.otherLanguages {
            let value = try XCTUnwrap(benefit[language], "[\(language)]")
            XCTAssertLessThanOrEqual(value.split(separator: " ").count, 12, "[\(language)] une phrase de bénéfice, pas deux")
            XCTAssertFalse(value.contains("Meeshy") && language == "fr")
        }
        for language in Self.otherLanguages { XCTAssertNotEqual(benefit[language], benefit["fr"]) }
    }

    func test_phonePrompt_header_showsTheBenefitAtRest_withoutExplainingSignIn() throws {
        XCTAssertEqual(PhonePromptSheet.benefit, "Tes proches te retrouvent grâce à ton numéro.")
        XCTAssertFalse(PhonePromptSheet.benefit.contains("connecter"))
    }

    /// La connexion par numéro n'est dite nulle part ailleurs dans l'app : elle ne quitte pas l'écran, elle passe
    /// derrière un (i) dont le nom est la question (revue #18088, « aucun texte n'est perdu »).
    func test_phonePrompt_signIn_isBehindAnInfoNamedByItsQuestion_inSevenLanguages() throws {
        let note = PhonePromptSheet.signInNote
        XCTAssertTrue(note.question.hasSuffix("?"))
        XCTAssertTrue(note.text.contains("te connecter"))
        let catalog = try app()
        for key in ["contacts.phonePrompt.signIn.question", "contacts.phonePrompt.signIn.note"] {
            let values = try XCTUnwrap(catalog[key], key)
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(values[language], "[\(language)] \(key)")
                XCTAssertNotEqual(value, values["fr"], "[\(language)] \(key) traduit, pas copié")
            }
        }
    }
}
