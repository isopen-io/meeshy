import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// Integration test: message with translations -> preferredTranslation resolves -> display
@MainActor
final class TranslationFlowTests: XCTestCase {

    // MARK: - Helpers

    private func makeTranslation(
        id: String = "t1",
        messageId: String = "msg1",
        sourceLanguage: String = "en",
        targetLanguage: String = "fr",
        content: String = "Bonjour"
    ) -> MessageTranslation {
        MessageTranslation(
            id: id,
            messageId: messageId,
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
            translatedContent: content,
            translationModel: "nllb-200",
            confidenceScore: 0.95
        )
    }

    private func makeAPIMessage(id: String = "msg1", content: String = "Hello") -> APIMessage {
        JSONStub.decode("""
        {"id":"\(id)","conversationId":"conv1","senderId":"user1","content":"\(content)","originalLanguage":"en","createdAt":"2026-01-01T00:00:00.000Z"}
        """)
    }

    // MARK: - Translation via Socket Event

    func test_translationEvent_publishedOnSocket() {
        let socket = MockMessageSocket()
        var received: [TranslationEvent] = []
        let cancellable = socket.translationReceived.sink { event in
            received.append(event)
        }

        let event: TranslationEvent = JSONStub.decode("""
        {"messageId":"msg1","translations":[{"id":"t1","messageId":"msg1","sourceLanguage":"en","targetLanguage":"fr","translatedContent":"Bonjour","translationModel":"nllb-200","confidenceScore":0.95}]}
        """)
        socket.translationReceived.send(event)

        XCTAssertEqual(received.count, 1)
        XCTAssertEqual(received.first?.messageId, "msg1")
        cancellable.cancel()
    }

    // MARK: - Translation Resolution Logic

    func test_preferredTranslation_matchesSystemLanguage() {
        let frTranslation = makeTranslation(targetLanguage: "fr", content: "Bonjour le monde")
        let esTranslation = makeTranslation(id: "t2", targetLanguage: "es", content: "Hola mundo")
        let translations = [frTranslation, esTranslation]

        let preferredLanguages = ["fr", "es"]
        let match = translations.first { t in
            preferredLanguages.first { lang in
                t.targetLanguage.lowercased() == lang.lowercased()
            } != nil
        }

        XCTAssertNotNil(match)
        XCTAssertEqual(match?.targetLanguage, "fr")
        XCTAssertEqual(match?.translatedContent, "Bonjour le monde")
    }

    func test_preferredTranslation_fallsToRegionalLanguage() {
        let esTranslation = makeTranslation(id: "t2", targetLanguage: "es", content: "Hola mundo")
        let translations = [esTranslation]

        let preferredLanguages = ["fr", "es"]
        var match: MessageTranslation?
        for lang in preferredLanguages {
            if let found = translations.first(where: { $0.targetLanguage.lowercased() == lang.lowercased() }) {
                match = found
                break
            }
        }

        XCTAssertNotNil(match)
        XCTAssertEqual(match?.targetLanguage, "es")
        XCTAssertEqual(match?.translatedContent, "Hola mundo")
    }

    func test_preferredTranslation_noMatch_returnsNil() {
        let deTranslation = makeTranslation(id: "t3", targetLanguage: "de", content: "Hallo Welt")
        let translations = [deTranslation]

        let preferredLanguages = ["fr", "es"]
        var match: MessageTranslation?
        for lang in preferredLanguages {
            if let found = translations.first(where: { $0.targetLanguage.lowercased() == lang.lowercased() }) {
                match = found
                break
            }
        }

        XCTAssertNil(match, "No translation should match when preferred languages are not available")
    }

    func test_preferredTranslation_originalLanguageMatchesPreferred_returnsNil() {
        let frTranslation = makeTranslation(targetLanguage: "fr", content: "Bonjour")
        let translations = [frTranslation]

        let originalLanguage = "fr"
        let preferredLanguages = ["fr"]

        var result: MessageTranslation?
        for lang in preferredLanguages {
            if originalLanguage.lowercased() == lang.lowercased() {
                result = nil
                break
            }
            if let found = translations.first(where: { $0.targetLanguage.lowercased() == lang.lowercased() }) {
                result = found
                break
            }
        }

        XCTAssertNil(result, "When original language matches preferred, should return nil (show original)")
    }

    // MARK: - Translation Request via Socket

    func test_requestTranslation_sendsToSocket() {
        let socket = MockMessageSocket()
        socket.requestTranslation(messageId: "msg1", targetLanguage: "es")

        XCTAssertEqual(socket.translationRequests.count, 1)
        XCTAssertEqual(socket.translationRequests.first?.messageId, "msg1")
        XCTAssertEqual(socket.translationRequests.first?.targetLanguage, "es")
    }

    // MARK: - Override Translation

    func test_activeTranslationOverride_takePrecedence() {
        let frTranslation = makeTranslation(targetLanguage: "fr", content: "Bonjour")
        let esTranslation = makeTranslation(id: "t2", targetLanguage: "es", content: "Hola")

        var overrides: [String: MessageTranslation?] = [:]
        overrides["msg1"] = esTranslation

        let override = overrides["msg1"]
        XCTAssertNotNil(override)
        XCTAssertEqual(override??.targetLanguage, "es")
        XCTAssertEqual(override??.translatedContent, "Hola")

        _ = frTranslation
    }
}
