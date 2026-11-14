import XCTest
import MeeshySDK
@testable import Meeshy

/// L'épure 3/3 (#17584, #18088) : cercles, contacts, profil vocal et profil tiennent en une ligne.
/// Règle 2 : la rangée d'une demande envoyée ne dit pas l'attente deux fois. Règle 4 : le clavier au repos n'affiche
/// rien sous son champ. Règle 2 + 1 : la consigne de lecture du profil vocal n'est dite qu'une fois, le conseil de
/// ton passe derrière un (i) nommé par sa question. Règle 1 : le toast hors ligne est une vraie clé, courte.
@MainActor
final class EpureLignesVuesTests: XCTestCase {

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

    private static let french: [String: String] = [
        "circles.requests.outgoing": "Niveau %@",
        "voice.profile.wizard.recording.question": "Comment dois-je parler ?",
        "voice.profile.wizard.recording.description": "Parlez naturellement, sans forcer le ton.",
        "profile.save.queued": "Enregistré, envoi au retour du réseau",
    ]

    func test_catalog_shortenedAndNewLabels_areTranslatedInTheSixOtherLanguages_neverCopiedFromFrench() throws {
        let app = try app()
        for (key, french) in Self.french {
            let values = app[key] ?? [:]
            XCTAssertEqual(values["fr"], french, key)
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(values[language], "\(key) [\(language)]")
                XCTAssertFalse(value.isEmpty, "\(key) [\(language)]")
                XCTAssertNotEqual(value, french, "\(key) [\(language)] : copié du français")
            }
        }
    }

    func test_catalog_removedKeys_areGoneFromEveryLanguage() throws {
        let app = try app()
        XCTAssertNil(app["keypad.prompt.title"], "plus aucun lecteur : supprimée des sept langues")
        XCTAssertNil(app["Modifications enregistrees — seront synchronisees au retour en ligne"], "l'ancienne clé littérale quitte le catalogue")
    }

    func test_catalog_everyEditedKey_carriesTheSevenLanguages() throws {
        let app = try app()
        for key in Self.french.keys {
            XCTAssertEqual(app[key]?.count, 7, "\(key) : sept langues")
        }
    }

    // MARK: - Contacts > Demandes > Envoyées

    func test_outgoingRequestRow_saysTheLevelOnly_theStatePillSaysWaiting() throws {
        let tab = try code("Features/Contacts/RequestsTab.swift")
        XCTAssertTrue(tab.contains("defaultValue: \"Niveau %@\""))
        XCTAssertFalse(tab.contains("En attente · %@"))
        XCTAssertTrue(tab.contains("contacts.requests.pending"), "la pastille « En attente » reste : c'est elle qui dit l'état")
    }

    func test_circlesTabOutgoingRaise_keepsSayingItIsWaiting_throughTheSharedPendingKey() throws {
        let rows = try code("Features/Contacts/CircleRows.swift")
        XCTAssertFalse(rows.contains("circles.requests.outgoing"))
        XCTAssertTrue(rows.contains("circles.pending"), "dans la liste des cercles, aucune pastille : la ligne dit que la demande est envoyée")
    }

    // MARK: - Contacts > Clavier

    func test_keypad_atRest_showsNothingUnderTheField_andKeepsNoMatchForARealEmptySearch() throws {
        let tab = try code("Features/Contacts/KeypadTab.swift")
        XCTAssertFalse(tab.contains("keypad.prompt"))
        XCTAssertTrue(tab.contains("EmptyView()"))
        XCTAssertTrue(tab.contains("keypad.no-match.title"))
    }

    // MARK: - Profil vocal

    func test_voiceWizard_recordingNote_isNamedByItsQuestion_andCarriesTheToneAdvice() {
        let note = VoiceProfileWizardWording.recordingNote
        XCTAssertEqual(note.question, "Comment dois-je parler ?")
        XCTAssertEqual(note.text, "Parlez naturellement, sans forcer le ton.")
    }

    func test_voiceWizard_recordingStep_hostsTheInfoOnTheTitle_andDropsTheReadAloudSentence() throws {
        let view = try code("Features/Settings/Views/VoiceProfileWizardView.swift")
        XCTAssertTrue(view.contains("MeeshyInfoNoted(note: VoiceProfileWizardWording.recordingNote"))
        XCTAssertTrue(view.contains("voice.profile.wizard.recording.title"))
        XCTAssertFalse(view.contains("Lisez à voix haute"), "la carte du kit porte déjà « Lisez ce texte à voix haute »")
    }

    func test_voiceWizard_consentAndCloningIntro_stayUntouched() throws {
        let view = try code("Features/Settings/Views/VoiceProfileWizardView.swift")
        XCTAssertTrue(view.contains("voice.profile.wizard.intro"))
    }

    // MARK: - Profil : toast hors ligne

    func test_profile_offlineSaveToast_isARealCatalogKey_andShort() throws {
        let view = try code("Features/Profile/Views/ProfileView.swift")
        XCTAssertTrue(view.contains("profile.save.queued"))
        XCTAssertFalse(view.contains("Modifications enregistrees"))
        for (language, value) in try XCTUnwrap(try app()["profile.save.queued"]) {
            XCTAssertLessThanOrEqual(value.count, 80, "[\(language)] « \(value) »")
        }
    }
}
