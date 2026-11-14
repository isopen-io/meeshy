import XCTest
import MeeshySDK
@testable import Meeshy

/// L'épure des réglages, lot iOS 2/3 (#17584, #17652) : un doublon sort, un libellé se raccourcit derrière un (i),
/// et trois repères propres à Meeshy (codes de secours, dernière connexion, cercles prévenus) deviennent lisibles
/// AU REPOS (règle 7) — jamais derrière un (i), qui ne reçoit que le détail secondaire.
@MainActor
final class EpureReglagesReperesTests: XCTestCase {

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

    private func shippedSources() throws -> String {
        let roots = ["apps/ios/Meeshy", "packages/MeeshySDK/Sources"].map { Self.repoRoot.appendingPathComponent($0) }
        return try roots.flatMap { root -> [String] in
            let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
            return try (walker?.allObjects as? [URL] ?? [])
                .filter { $0.pathExtension == "swift" }
                .map { AppSourceGuard.stripComments(try String(contentsOf: $0, encoding: .utf8)) }
        }.joined(separator: "\n")
    }

    private static let views = "Features/Settings/Views/"
    private static let otherLanguages = ["en", "es", "pt-BR", "de", "it", "ar"]

    private static let french: [String: String] = [
        "settings.notifications.bring.summary": "Un son forcé pour l’urgence extrême, même en silencieux.",
        "settings.notifications.bring.question": "Que se passe-t-il si je le coupe ?",
        "settings.notifications.bring.note": "Coupé, personne ne peut plus faire sonner votre téléphone.",
        "settings.security.2fa.backup_codes.summary": "Pour entrer sans votre téléphone ; de nouveaux codes annulent les anciens.",
        "settings.privacy.last_seen.summary": "Vos proches voient quand vous étiez actif, vos amis si vous êtes en ligne.",
        "settings.privacy.hide_from_contact_search.summary": "Votre profil ne ressort plus d'une recherche par numéro ou e-mail.",
        "settings.privacy.hide_from_contact_search.info": "Activé, vos contacts ne sont pas non plus prévenus de votre arrivée sur Meeshy.",
        "circleNotify.notified": "Prévenus : %@",
    ]

    func test_catalog_newAndShortenedLabels_sayTheirFrench() throws {
        let app = try app()
        for (key, expected) in Self.french { XCTAssertEqual(app[key]?["fr"], expected, key) }
    }

    func test_catalog_newAndShortenedLabels_areTranslatedInTheSixOtherLanguages_neverCopiedFromFrench() throws {
        let app = try app()
        for key in Self.french.keys {
            let values = app[key] ?? [:]
            let french = try XCTUnwrap(values["fr"], key)
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(values[language], "\(key) [\(language)]")
                XCTAssertFalse(value.isEmpty, "\(key) [\(language)]")
                XCTAssertNotEqual(value, french, "\(key) [\(language)] : copié du français")
            }
        }
    }

    func test_catalog_bringSummary_isUnderTheLongThreshold_inEveryLanguage() throws {
        for (language, value) in try XCTUnwrap(app()["settings.notifications.bring.summary"]) {
            XCTAssertLessThanOrEqual(value.count, 80, "settings.notifications.bring.summary [\(language)] : « \(value) »")
        }
    }

    // MARK: - Règle 2 : « Sauvegarder média » redit « Enregistrer dans Photos »

    func test_saveMedia_isGoneFromPrivacy_andFromEveryLanguage() throws {
        XCTAssertNil(try app()["settings.privacy.save_media"], "la clé quitte les sept langues")
        XCTAssertFalse(try shippedSources().contains("\"settings.privacy.save_media\""))
        let view = try code(Self.views + "PrivacySettingsView.swift")
        XCTAssertFalse(view.contains("saveMediaToGallery"), "le réglage vit chez Téléchargement auto")
        XCTAssertTrue(view.contains("\\.allowAnalytics"), "la section Données garde Analytique")
    }

    /// Sans « Sauvegarder média », la section ne porte plus aucun média : son titre ne l'annonce plus.
    func test_privacy_dataSection_isTitledByWhatItHolds_noMediaLeft() throws {
        let app = try app()
        XCTAssertNil(app["settings.privacy.media_data"], "« Média & Données » quitte les sept langues")
        XCTAssertEqual(app["settings.privacy.data"]?["fr"], "Données")
        for language in Self.otherLanguages {
            let value = try XCTUnwrap(app["settings.privacy.data"]?[language], language)
            XCTAssertNotEqual(value, "Données", "\(language) : copié du français")
        }
        let view = try code(Self.views + "PrivacySettingsView.swift")
        XCTAssertTrue(view.contains("\"settings.privacy.data\""))
    }

    func test_saveMedia_stillLivesWhereItsNoteIs_inTheAutoDownloadGallery() throws {
        let view = try code(Self.views + "MediaDownloadSettingsView.swift")
        XCTAssertTrue(view.contains("saveMediaToGallery"))
        XCTAssertTrue(view.contains("SettingsInfoNotes.galleryAutosave"))
    }

    // MARK: - Règle 1 : le Bring garde sa phrase, la conséquence passe derrière un (i)

    func test_bring_consequenceIsBehindAnInfoNote_namedByItsQuestion() {
        let note = SettingsInfoNotes.bringOff
        XCTAssertEqual(note.question, "Que se passe-t-il si je le coupe ?")
        XCTAssertTrue(note.text.contains("personne ne peut plus faire sonner"))
        XCTAssertTrue(SettingsInfoNotes.all.map(\.question).contains(note.question), "le témoin des notes le parcourt")
    }

    func test_bring_sentenceStaysVisibleAtRest_andCarriesTheInfoNote() throws {
        let view = try code(Self.views + "NotificationSettingsView.swift")
        XCTAssertTrue(view.contains("settings.notifications.bring.summary"), "la phrase reste lisible au repos (règle 7)")
        XCTAssertTrue(view.contains("MeeshyInfoNoted(note: SettingsInfoNotes.bringOff"))
    }

    // MARK: - Règle 7 : trois repères propres à Meeshy lisibles au repos

    func test_twoFactor_backupCodes_sayWhatTheyAreFor_atRestWhenTwoFactorIsOn() throws {
        let view = try code(Self.views + "SecurityTwoFactorSection.swift")
        XCTAssertTrue(view.contains("settings.security.2fa.backup_codes.summary"))
        XCTAssertTrue(view.contains("SettingsSentence(text: String(localized: \"settings.security.2fa.backup_codes.summary\""), "une phrase, pas un (i)")
        XCTAssertFalse(view.contains("MeeshyInfoNote"))
    }

    func test_privacy_lastSeen_saysWhoSeesWhat_atRest_andTheDetailStaysBehindTheExistingNote() throws {
        let view = try code(Self.views + "PrivacySettingsView.swift")
        XCTAssertTrue(view.contains("settings.privacy.last_seen.summary"))
        XCTAssertFalse(SettingsInfoNotes.onlineStatus.text.isEmpty, "le (i) « Qui voit que je suis en ligne ? » garde le détail")
        XCTAssertEqual(SettingsInfoNotes.onlineStatus.question, "Qui voit que je suis en ligne ?")
    }

    /// Choisir un cercle prévient aussi les cercles plus proches : la phrase nomme, dans l'ordre, chaque cercle prévenu,
    /// avec les MÊMES mots que le sélecteur — la loi d'inclusion se calcule, elle ne se recopie pas en quatre phrases.
    func test_circleNotify_everyChoiceSaysWhoIsNotified_followingTheInclusionLaw() throws {
        for choice in RelationAudienceChoice.allCases {
            XCTAssertNotNil(CircleNotifySettingsContent.explanation(of: choice), "\(choice) : aucune phrase")
        }
        let inclusive: [RelationAudienceChoice] = [.blood, .close, .friend, .acquaintance]
        for (rank, choice) in inclusive.enumerated() {
            let sentence = try XCTUnwrap(CircleNotifySettingsContent.explanation(of: choice))
            for notified in inclusive[...rank] {
                XCTAssertTrue(sentence.contains(CircleNotifySettingsContent.label(of: notified)), "\(choice) : « \(sentence) » doit nommer \(notified)")
            }
            for spared in inclusive[(rank + 1)...] {
                XCTAssertFalse(sentence.contains(CircleNotifySettingsContent.label(of: spared)), "\(choice) : « \(sentence) » ne prévient pas \(spared)")
            }
        }
    }

    func test_circleNotify_inclusionSentence_isComputed_notFourCopiedExplanations() throws {
        let app = try app()
        for level in ["BLOOD", "CLOSE", "FRIEND", "ACQUAINTANCE"] {
            XCTAssertNil(app["circleNotify.explain.\(level)"], "circleNotify.explain.\(level) quitte les sept langues : la phrase se calcule")
        }
        XCTAssertEqual(app["circleNotify.notified"]?["fr"], "Prévenus : %@")
    }

    // MARK: - Règle 7 : le carnet d'adresses dit ce qu'il fait, au repos

    func test_privacy_hideFromContactSearch_saysWhatItDoes_atRest_notOnlyBehindTheInfo() throws {
        let view = try code(Self.views + "PrivacySettingsView.swift")
        XCTAssertTrue(view.contains("settings.privacy.hide_from_contact_search.summary"), "la phrase d'orientation est lisible sans clic")
        XCTAssertTrue(view.contains("note: SettingsInfoNotes.contactSearch"), "le (i) reste pour le détail secondaire")
    }

    func test_contactSearchNote_keepsItsQuestion_andOnlyTheSecondaryDetail() {
        let note = SettingsInfoNotes.contactSearch
        XCTAssertEqual(note.question, "Qui peut me trouver par mon numéro ?")
        XCTAssertFalse(note.text.contains("recherche par numéro"), "la phrase visible le dit déjà : le (i) ne la répète pas")
        XCTAssertTrue(note.text.contains("pas non plus prévenus"), "le détail secondaire : les contacts ne sont pas prévenus")
    }
}
