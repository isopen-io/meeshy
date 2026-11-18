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

    private func served(_ key: String) -> String { Bundle.main.localizedString(forKey: key, value: nil, table: nil) }

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

    func test_bring_explain_keepsTheOrientationSentence_andNotTheSilentModeDetail() throws {
        XCTAssertEqual(ProfileBringWording.explain, served("bring.explain"))
        let sentence = try XCTUnwrap(try app()["bring.explain"]?["fr"])
        XCTAssertEqual(sentence, "Pour une urgence extrême : son téléphone sonne, même verrouillé.")
        XCTAssertFalse(sentence.contains("silencieux"))
    }

    func test_bring_explainNote_isNamedByItsQuestion_andCarriesTheSilentModeDetail() throws {
        let app = try app()
        let note = ProfileBringWording.explainNote
        XCTAssertEqual(note.question, served("bring.silent.question"))
        XCTAssertEqual(note.text, served("bring.silent.note"))
        XCTAssertEqual(app["bring.silent.question"]?["fr"], "Et si son iPhone est en silencieux ?")
        XCTAssertEqual(app["bring.silent.note"]?["fr"], "Selon ses réglages, un iPhone en silencieux peut n’afficher qu’une alerte prioritaire.")
    }

    func test_bring_row_showsTheSentenceAtRest_andHostsTheInfoNote() throws {
        let view = try code("Features/Bring/ProfileBringRow.swift")
        XCTAssertTrue(view.contains("MeeshyInfoNoted(note: ProfileBringWording.explainNote"))
        XCTAssertTrue(view.contains("ProfileBringWording.explain"), "la phrase reste visible sans clic")
    }

    // MARK: - Position : l'échéance et l'arrêt restent au repos, la mise à jour passe derrière un (i)

    func test_shareLocation_explain_saysUntilWhenAndHowToStop_butNotTheRefreshDetail() throws {
        XCTAssertEqual(ShareLocationWording.explain(name: "Bob"), String(format: served("sharedLocation.share.explain"), "Bob"))
        let sentence = String(format: try XCTUnwrap(try app()["sharedLocation.share.explain"]?["fr"]), "Bob")
        XCTAssertEqual(sentence, "Bob voit ta position jusqu'à l'échéance ; tu peux l'arrêter depuis sa fiche.")
        XCTAssertTrue(sentence.contains("depuis sa fiche"), "la phrase dit où arrêter le partage")
        XCTAssertFalse(sentence.contains("Meeshy est ouvert"))
    }

    func test_shareLocation_explainNote_isNamedByItsQuestion() throws {
        let app = try app()
        let note = ShareLocationWording.explainNote
        XCTAssertEqual(note.question, served("sharedLocation.share.refresh.question"))
        XCTAssertEqual(note.text, served("sharedLocation.share.refresh.note"))
        XCTAssertEqual(app["sharedLocation.share.refresh.question"]?["fr"], "Quand ma position se met-elle à jour ?")
        XCTAssertEqual(app["sharedLocation.share.refresh.note"]?["fr"], "Elle se met à jour quand Meeshy est ouvert.")
    }

    func test_shareLocation_sheet_showsTheSentenceAtRest_andHostsTheInfoNoteInThePrecisionFooter() throws {
        let view = try code("Features/SharedLocation/Map/ShareMyLocationSheet.swift")
        XCTAssertTrue(view.contains("MeeshyInfoNoted(note: ShareLocationWording.explainNote"))
        XCTAssertTrue(view.contains("ShareLocationWording.explain(name: name)"))
    }
}

/// « Partager ma position » sur la fiche d'un Ami (#19637, planche `Autre-Actions`) : une rangée du kit (K06), titrée
/// par la personne, qui dit l'état du partage en sous-titre et porte « Arrêter » (K40) tant que le partage dure.
@MainActor
final class ProfileShareLocationLineTests: XCTestCase {

    private static let repoRoot: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    private func code(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: Self.repoRoot.appendingPathComponent("apps/ios/Meeshy/" + relativePath), encoding: .utf8))
    }

    func test_resolve_withoutShare_namesThePerson_saysNotShared_andOffersNoStop() {
        let line = ProfileShareLocationLine.resolve(name: "Léo", entry: nil)
        XCTAssertEqual(line.title, LocationMapCopy.shareMineWith("Léo"))
        XCTAssertEqual(line.subtitle, LocationMapCopy.myPosition(.notShared, name: "Léo"))
        XCTAssertFalse(line.offersStop)
    }

    func test_resolve_whileSharing_saysWhatTheySeeUntilWhen_andOffersStop() {
        let until = Date(timeIntervalSince1970: 1_800_000_000)
        let entry = SharedLocationRoster.Entry(precision: .neighborhood, until: until)
        let line = ProfileShareLocationLine.resolve(name: "Léo", entry: entry)
        XCTAssertEqual(line.title, LocationMapCopy.shareMineWith("Léo"))
        XCTAssertEqual(line.subtitle, ShareLocationWording.sharing(name: "Léo", precision: .neighborhood, until: until))
        XCTAssertTrue(line.offersStop)
    }

    func test_resolve_anOpenEndedShare_saysUntilIStop() {
        let entry = SharedLocationRoster.Entry(precision: .exact, until: SharedLocationShareTerm.openEndedDeadline)
        let line = ProfileShareLocationLine.resolve(name: "Léo", entry: entry)
        XCTAssertEqual(line.subtitle, ShareLocationWording.sharingUntilStopped(name: "Léo", precision: .exact))
        XCTAssertTrue(line.offersStop)
    }

    func test_row_isMadeOfTheKit_withoutEmojiFontOrHardcodedColor() throws {
        let source = try code("Features/SharedLocation/ProfileShareLocationRow.swift")
        let row = String(source[..<(source.range(of: "enum ShareLocationWording")?.lowerBound ?? source.endIndex)])
        XCTAssertTrue(row.contains("MeeshyToggleRow(line.title"), "la rangée est la ligne K06 du kit")
        XCTAssertTrue(row.contains("MeeshyButton(ShareLocationWording.stop"), "« Arrêter » est un bouton K40")
        XCTAssertTrue(row.contains("kind: .danger"), "« Arrêter » est un bouton K40 de danger")
        XCTAssertFalse(row.contains("📍"), "aucun émoji dans la rangée")
        XCTAssertFalse(row.contains("indigo500"), "aucune couleur codée en dur : la teinte vient de la fiche")
        XCTAssertFalse(row.contains(".font("), "aucune police posée sur place")
        XCTAssertFalse(row.contains("RoundedRectangle"), "aucun fond dessiné sur place")
        XCTAssertTrue(row.contains("ShareMyLocationSheet("), "la feuille de choix reste")
        XCTAssertTrue(row.contains("center.stopSharing(with: userId)"), "l'arrêt reste celui du centre")
    }

    func test_row_takesTheProfileAccent() throws {
        let section = try code("Features/Contacts/ProfileCircleSection.swift")
        XCTAssertTrue(section.contains("tint: tint"), "la section passe l'accent de la fiche à la rangée")
        let app = try code("MeeshyApp.swift")
        XCTAssertTrue(app.contains("ProfileCircleSection(userId: userId, displayName: displayName, linked: $linked, tint: tint)"))
    }
}
