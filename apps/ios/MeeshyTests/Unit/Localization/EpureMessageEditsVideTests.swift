import XCTest
import MeeshySDK
@testable import Meeshy

/// L'épure 2/3 (#17584, #18088), règle 4 : l'état vide de l'onglet Modifications tient en UNE ligne.
/// Le bandeau « Aucune modification » reste ; sa phrase de détail et l'état vide qui le répétaient sont retirés,
/// et leurs clés quittent le catalogue dans toutes les langues.
final class EpureMessageEditsVideTests: XCTestCase {

    private static let repoRoot: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    private static let removedKeys = ["message-detail.edits.none-detail", "message-detail.edits.empty"]
    private static let languages = ["fr", "en", "es", "pt-BR", "de", "it", "ar"]

    private func strings(_ relativePath: String) throws -> [String: Any] {
        let data = try Data(contentsOf: Self.repoRoot.appendingPathComponent(relativePath))
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        return try XCTUnwrap(root["strings"] as? [String: Any])
    }

    private func source(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: Self.repoRoot.appendingPathComponent("apps/ios/Meeshy/" + relativePath), encoding: .utf8))
    }

    private let view = "Features/Main/Components/MessageDetail/MessageEditsDetailView.swift"

    func test_editsView_withoutRevision_showsOnlyTheBanner_noDetailSentence_noEmptyState() throws {
        let code = try source(view)
        XCTAssertFalse(code.contains("MessageDetailEmptyState"))
        XCTAssertFalse(code.contains("message-detail.edits.none-detail"))
        XCTAssertFalse(code.contains("message-detail.edits.empty"))
        XCTAssertTrue(code.contains("message-detail.edits.none-title"), "le bandeau « Aucune modification » reste")
    }

    func test_editsView_withRevisions_keepsItsHistoryDetail() throws {
        let code = try source(view)
        XCTAssertTrue(code.contains("previousVersionsDetail(revisions.count)"))
    }

    func test_catalog_removedKeys_areGoneFromEveryLanguage() throws {
        let app = try strings("apps/ios/Meeshy/Localizable.xcstrings")
        for key in Self.removedKeys { XCTAssertNil(app[key], key) }
    }

    func test_catalog_noneTitle_staysTranslatedInEveryLanguage() throws {
        let app = try strings("apps/ios/Meeshy/Localizable.xcstrings")
        let entry = try XCTUnwrap(app["message-detail.edits.none-title"] as? [String: Any])
        let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any])
        for language in Self.languages { XCTAssertNotNil(localizations[language], language) }
    }
}
