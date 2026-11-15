import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class MessageTranslationMergeTests: XCTestCase {

    private func makeTranslation(
        target: String, content: String = "texte", id: String? = nil, source: String = "en"
    ) -> MessageTranslation {
        MessageTranslation(
            id: id ?? "tr-\(target)",
            messageId: "m1",
            sourceLanguage: source,
            targetLanguage: target,
            translatedContent: content,
            translationModel: "nllb",
            confidenceScore: nil
        )
    }

    func test_merge_replacesSameTargetLanguage_appendsOthers_preservingOrder() {
        let existing = [makeTranslation(target: "fr", content: "vieux"), makeTranslation(target: "es")]
        let incoming = [makeTranslation(target: "fr", content: "neuf"), makeTranslation(target: "de")]

        let merged = MessageTranslationMerge.merging(incoming, into: existing, prism: ["fr", "es", "de"])

        XCTAssertEqual(merged.map(\.targetLanguage), ["fr", "es", "de"])
        XCTAssertEqual(merged.first?.translatedContent, "neuf")
    }

    func test_prismFilter_isCaseInsensitive_andDropsOutsideReaderPrism() {
        let incoming = [makeTranslation(target: "FR"), makeTranslation(target: "ja")]

        let merged = MessageTranslationMerge.merging(
            incoming, into: [], prism: MessageTranslationMerge.prism(of: ["fr", "en"])
        )

        XCTAssertEqual(merged.map(\.targetLanguage), ["FR"])
    }

    func test_merge_withNothingIncoming_returnsExistingUntouched() {
        let existing = [makeTranslation(target: "fr")]

        let merged = MessageTranslationMerge.merging([], into: existing, prism: ["fr"])

        XCTAssertEqual(merged, existing)
    }

    func test_fromRecords_projectsEveryField_andDefaultsSourceToAuto() {
        let record = TranslationRecord(
            id: "tr1", messageLocalId: "srv1", messageServerId: "srv1",
            targetLanguage: "fr", translatedContent: "Bonjour",
            translationModel: "nllb-200", confidenceScore: 0.9,
            sourceLanguage: nil, receivedAt: Date()
        )

        let projected = MessageTranslationMerge.translations(from: [record], messageId: "srv1")

        XCTAssertEqual(projected, [MessageTranslation(
            id: "tr1", messageId: "srv1", sourceLanguage: "auto", targetLanguage: "fr",
            translatedContent: "Bonjour", translationModel: "nllb-200", confidenceScore: 0.9
        )])
    }

    func test_fromCached_keepsTheCachedSourceLanguage() {
        let cached = TranslationData(
            id: "c1", messageId: "m1", sourceLanguage: "en", targetLanguage: "fr",
            translatedContent: "Salut", translationModel: "nllb", confidenceScore: nil
        )

        let projected = MessageTranslationMerge.translations(from: [cached])

        XCTAssertEqual(projected.first?.sourceLanguage, "en")
        XCTAssertEqual(projected.first?.translatedContent, "Salut")
    }

    func test_fromAPI_fallsBackOnMessageOriginalLanguage_thenAuto() throws {
        let json = """
        [{"id":"a1","messageId":"m1","targetLanguage":"fr","translatedContent":"Salut"}]
        """.data(using: .utf8)!
        let api = try JSONDecoder().decode([APITextTranslation].self, from: json)

        let withOrigin = MessageTranslationMerge.translations(from: api, originalLanguage: "en")
        let withoutOrigin = MessageTranslationMerge.translations(from: api, originalLanguage: nil)

        XCTAssertEqual(withOrigin.first?.sourceLanguage, "en")
        XCTAssertEqual(withoutOrigin.first?.sourceLanguage, "auto")
        XCTAssertNil(withOrigin.first?.translationModel)
    }
}
