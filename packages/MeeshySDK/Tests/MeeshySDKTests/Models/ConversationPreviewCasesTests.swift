import XCTest
@testable import MeeshySDK

/// Le composeur Swift rejoue le fichier de cas COMMUN
/// (`packages/shared/fixtures/conversation-preview-cases.json`) que joue aussi
/// `composeConversationPreview()` côté TypeScript (#7546). Les deux composeurs
/// ne peuvent donc pas diverger sans qu'un des deux rougisse (#7548).
///
/// Les libellés viennent du catalogue de l'APP (`Localizable.xcstrings`), pas
/// d'une table recopiée ici : c'est ce que l'utilisateur lira. Un libellé qui
/// dériverait du catalogue partagé rougit donc ici, cas par cas.
final class ConversationPreviewCasesTests: XCTestCase {

    private struct Case: Decodable {
        let id: String
        let input: ConversationPreviewInput
        let text: String
    }

    // MARK: - Fichiers du dépôt

    private func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Models
            .deletingLastPathComponent()   // MeeshySDKTests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
            .deletingLastPathComponent()   // packages
            .deletingLastPathComponent()   // racine
    }

    private func casesFile() throws -> (cases: [Case], raw: [[String: Any]]) {
        let url = repoRoot().appendingPathComponent("packages/shared/fixtures/conversation-preview-cases.json")
        let data = try Data(contentsOf: url)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            guard let date = WireDate.date(from: raw) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: raw)
            }
            return date
        }
        struct File: Decodable { let cases: [Case] }
        let cases = try decoder.decode(File.self, from: data).cases
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let raw = try XCTUnwrap(json["cases"] as? [[String: Any]])
        return (cases, raw)
    }

    /// Le catalogue de l'app, par langue du composeur : `pt` y vit sous `pt-BR`.
    private func appCatalog() throws -> [String: [String: String]] {
        let url = repoRoot().appendingPathComponent("apps/ios/Meeshy/Localizable.xcstrings")
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let strings = try XCTUnwrap(json["strings"] as? [String: Any])
        var catalog: [String: [String: String]] = [:]
        for key in ConversationPreviewStringKey.allCases {
            let entry = strings[key.rawValue] as? [String: Any]
            let localizations = entry?["localizations"] as? [String: Any] ?? [:]
            for (xcLanguage, value) in localizations {
                let unit = (value as? [String: Any])?["stringUnit"] as? [String: Any]
                guard let text = unit?["value"] as? String else { continue }
                let language = xcLanguage == "pt-BR" ? "pt" : xcLanguage
                catalog[language, default: [:]][key.rawValue] = text
            }
        }
        return catalog
    }

    private func strings(_ language: String, catalog: [String: [String: String]]) -> ConversationPreviewStrings {
        let table = catalog[ConversationPreviewLanguage(code: language).rawValue] ?? [:]
        return ConversationPreviewStrings(language: language) { key in table[key.rawValue] ?? "⟦\(key.rawValue)⟧" }
    }

    // MARK: - La valeur structurée, sous la forme du fichier commun

    private func json(_ preview: ConversationPreview) -> [String: Any] {
        var out: [String: Any] = [
            "kind": preview.kind.rawValue,
            "tone": preview.tone.rawValue,
            "icon": preview.icon?.rawValue ?? NSNull(),
            "segments": preview.segments.map { json($0) },
        ]
        switch preview.author {
        case .none: out["author"] = NSNull()
        case .reader(let label)?: out["author"] = ["kind": "self", "label": label]
        case .member(let id, let label)?: out["author"] = ["kind": "member", "id": id, "label": label]
        case .draft(let label)?: out["author"] = ["kind": "draft", "label": label]
        }
        if let live = preview.liveUntil { out["live"] = ["expiresAt": milliseconds(live)] }
        if preview.offersJoin { out["action"] = "join" }
        if let direction = preview.direction { out["direction"] = direction.rawValue }
        return out
    }

    private func json(_ segment: ConversationPreviewSegment) -> [String: Any] {
        switch segment {
        case .text(let text, let language):
            return ["kind": "text", "text": text, "language": language ?? NSNull()]
        case .label(let text):
            return ["kind": "label", "text": text]
        case .countdown(let text, let expiresAt):
            return ["kind": "countdown", "text": text, "expiresAt": milliseconds(expiresAt)]
        }
    }

    private func milliseconds(_ date: Date) -> Double {
        (date.timeIntervalSince1970 * 1000).rounded()
    }

    // MARK: - Témoins

    func test_everyCommonCase_rendersTheSameFlatLine() throws {
        let (cases, _) = try casesFile()
        let catalog = try appCatalog()
        XCTAssertGreaterThan(cases.count, 50, "le fichier commun a-t-il perdu ses cas ?")

        for entry in cases {
            let localizer = strings(entry.input.language, catalog: catalog)
            let preview = ConversationPreviewComposer.compose(entry.input, strings: localizer)
            XCTAssertEqual(ConversationPreviewComposer.render(preview, strings: localizer), entry.text, entry.id)
        }
    }

    func test_everyCommonCase_composesTheSameStructuredValue() throws {
        let (cases, raw) = try casesFile()
        let catalog = try appCatalog()

        for (entry, rawEntry) in zip(cases, raw) {
            let expected = try XCTUnwrap(rawEntry["expected"] as? [String: Any], "\(entry.id) : pas de valeur attendue")
            let localizer = strings(entry.input.language, catalog: catalog)
            let actual = json(ConversationPreviewComposer.compose(entry.input, strings: localizer))
            XCTAssertEqual(
                NSDictionary(dictionary: actual), NSDictionary(dictionary: expected),
                "\(entry.id)\nattendu : \(expected)\nobtenu  : \(actual)"
            )
        }
    }

    func test_theAppCatalogCarriesEveryKeyInTheSevenLanguages() throws {
        let catalog = try appCatalog()
        for language in ConversationPreviewLanguage.allCases {
            let table = catalog[language.rawValue] ?? [:]
            let missing = ConversationPreviewStringKey.allCases.filter { table[$0.rawValue] == nil }.map(\.rawValue)
            XCTAssertTrue(missing.isEmpty, "\(language.rawValue) : \(missing)")
        }
    }

    // MARK: - Ce que le fichier commun garantit, redit en Swift

    func test_protectedMessages_neverCarryTheirTextOrTranslation() throws {
        let (cases, _) = try casesFile()
        let catalog = try appCatalog()
        let protected: [String: [String]] = [
            "view-once": ["4242"],
            "blurred": ["Spoiler"],
            "encrypted": ["AAECAwQ="],
            "cumul-view-once-beats-blur-ephemeral-effect": ["Secret", "Zoom"],
            "en-view-once-placeholder-not-translated": ["4242", "code"],
        ]
        for entry in cases {
            guard let secrets = protected[entry.id] else { continue }
            let preview = ConversationPreviewComposer.compose(entry.input, strings: strings(entry.input.language, catalog: catalog))
            let flat = preview.segments.map(\.text).joined(separator: " ")
            for secret in secrets {
                XCTAssertFalse(flat.contains(secret), "\(entry.id) laisse fuir « \(secret) »")
            }
            XCTAssertFalse(preview.segments.contains { if case .text = $0 { return true } else { return false } },
                           "\(entry.id) : un message protégé ne rend aucun contenu")
        }
    }

    func test_liveEphemeral_switchesToExpiredOnItsOwnOnceItsDeadlinePasses() throws {
        let (cases, _) = try casesFile()
        let catalog = try appCatalog()
        let live = try XCTUnwrap(cases.first { $0.id == "ephemeral-live" })
        let localizer = strings(live.input.language, catalog: catalog)
        let deadline = try XCTUnwrap(ConversationPreviewComposer.compose(live.input, strings: localizer).liveUntil)

        let later = ConversationPreviewInput(
            viewerId: live.input.viewerId, language: live.input.language,
            preferredLanguages: live.input.preferredLanguages, now: deadline,
            receivedAt: live.input.receivedAt, lastMessage: live.input.lastMessage
        )
        let expired = ConversationPreviewComposer.compose(later, strings: localizer)

        XCTAssertEqual(expired.icon, .expired)
        XCTAssertNil(expired.liveUntil, "une ligne expirée n'a plus rien à décompter")
    }
}
