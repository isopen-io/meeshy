import XCTest
import MeeshySDK
@testable import Meeshy

/// L'épure 1/3 du profil (#17584, #18088) : la fiche garde, AU REPOS, ce que le Bring et le partage de position ont
/// d'unique (règle 7) ; le détail secondaire passe derrière un (i) nommé par sa question (règle 1).
@MainActor
final class EpureProfilBringPositionTests: XCTestCase {

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
        "bring.explain": "Pour une urgence extrême : son téléphone sonne, même verrouillé.",
        "bring.silent.question": "Et si son iPhone est en silencieux ?",
        "bring.silent.note": "Selon ses réglages, un iPhone en silencieux peut n’afficher qu’une alerte prioritaire.",
        "sharedLocation.share.explain": "%@ voit ta position jusqu'à l'échéance ; tu peux l'arrêter depuis sa fiche.",
        "sharedLocation.share.refresh.question": "Quand ma position se met-elle à jour ?",
        "sharedLocation.share.refresh.note": "Elle se met à jour quand Meeshy est ouvert.",
    ]

    func test_catalog_shortenedAndNewLabels_sayTheirFrench() throws {
        let app = try app()
        for (key, expected) in Self.french { XCTAssertEqual(app[key]?["fr"], expected, key) }
    }

    func test_catalog_shortenedAndNewLabels_areTranslatedInTheSixOtherLanguages_neverCopiedFromFrench() throws {
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

    func test_catalog_visibleSentences_areUnderTheLongThreshold_inEveryLanguage() throws {
        let app = try app()
        for key in ["bring.explain", "sharedLocation.share.explain"] {
            for (language, value) in try XCTUnwrap(app[key]) {
                XCTAssertLessThanOrEqual(value.count, 80, "\(key) [\(language)] : « \(value) »")
            }
        }
    }

    // MARK: - Bring : la première phrase reste au repos, la seconde passe derrière un (i)

    func test_bring_explain_keepsTheOrientationSentence_andNotTheSilentModeDetail() {
        XCTAssertEqual(ProfileBringWording.explain, "Pour une urgence extrême : son téléphone sonne, même verrouillé.")
        XCTAssertFalse(ProfileBringWording.explain.contains("silencieux"))
    }

    func test_bring_explainNote_isNamedByItsQuestion_andCarriesTheSilentModeDetail() {
        let note = ProfileBringWording.explainNote
        XCTAssertEqual(note.question, "Et si son iPhone est en silencieux ?")
        XCTAssertEqual(note.text, "Selon ses réglages, un iPhone en silencieux peut n’afficher qu’une alerte prioritaire.")
    }

    func test_bring_row_showsTheSentenceAtRest_andHostsTheInfoNote() throws {
        let view = try code("Features/Bring/ProfileBringRow.swift")
        XCTAssertTrue(view.contains("MeeshyInfoNoted(note: ProfileBringWording.explainNote"))
        XCTAssertTrue(view.contains("ProfileBringWording.explain"), "la phrase reste visible sans clic")
    }

    // MARK: - Position : l'échéance et l'arrêt restent au repos, la mise à jour passe derrière un (i)

    func test_shareLocation_explain_saysUntilWhenAndHowToStop_butNotTheRefreshDetail() {
        let sentence = ShareLocationWording.explain(name: "Bob")
        XCTAssertEqual(sentence, "Bob voit ta position jusqu'à l'échéance ; tu peux l'arrêter depuis sa fiche.")
        XCTAssertTrue(sentence.contains("depuis sa fiche"), "la phrase dit où arrêter le partage")
        XCTAssertFalse(sentence.contains("Meeshy est ouvert"))
    }

    func test_shareLocation_explainNote_isNamedByItsQuestion() {
        let note = ShareLocationWording.explainNote
        XCTAssertEqual(note.question, "Quand ma position se met-elle à jour ?")
        XCTAssertEqual(note.text, "Elle se met à jour quand Meeshy est ouvert.")
    }

    func test_shareLocation_sheet_showsTheSentenceAtRest_andHostsTheInfoNoteInThePrecisionFooter() throws {
        let view = try code("Features/SharedLocation/ProfileShareLocationRow.swift")
        XCTAssertTrue(view.contains("MeeshyInfoNoted(note: ShareLocationWording.explainNote"))
        XCTAssertTrue(view.contains("ShareLocationWording.explain(name: displayName)"))
    }
}
