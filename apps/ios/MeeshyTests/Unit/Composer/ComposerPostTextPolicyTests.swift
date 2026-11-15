import XCTest
@testable import Meeshy

/// #13824 — le texte d'une publication ne dépasse jamais le plafond du serveur.
///
/// `CreatePostSchema.content` est `z.string().max(5000)` : Zod compte en unités
/// UTF-16, pas en caractères perçus. Un texte de 5 001 « é » ou de 2 501 emojis
/// partait du composer, était refusé en 400 à chaque « Réessayer », et restait
/// bloqué dans la file d'envoi.
final class ComposerPostTextPolicyTests: XCTestCase {

    private func draft(text: String) -> ComposerDocumentDraft {
        ComposerDocumentDraft.document(
            format: .post, forcePlainPost: true, text: text, visibility: .public,
            visibilityUserIds: [], repostOfId: nil, localMedia: [], location: nil,
            discoverabilityPrecision: nil, originalLanguage: nil, mobileTranscription: nil, references: [],
            storyEffects: nil, mediaCaptions: [:], mediaAlts: [:], mediaObjectIds: [:],
            allowSoundExtraction: nil
        )
    }

    func test_contentLimit_isTheServerCap() {
        XCTAssertEqual(ComposerPostTextPolicy.contentLimit, 5000)
    }

    func test_truncate_textAtTheLimit_isKeptWhole() {
        let text = String(repeating: "é", count: 5000)
        XCTAssertEqual(ComposerPostTextPolicy.truncate(text), text)
    }

    func test_truncate_textOverTheLimit_isCutToTheLimit() {
        let capped = ComposerPostTextPolicy.truncate(String(repeating: "é", count: 5001))
        XCTAssertEqual(ComposerPostTextPolicy.length(of: capped), 5000)
    }

    func test_length_countsWhatTheServerCounts_utf16() {
        XCTAssertEqual(ComposerPostTextPolicy.length(of: "😀"), 2)
    }

    func test_truncate_neverSplitsAnEmoji() {
        let capped = ComposerPostTextPolicy.truncate("a" + String(repeating: "😀", count: 2500))
        XCTAssertEqual(ComposerPostTextPolicy.length(of: capped), 4999)
        XCTAssertTrue(capped.hasSuffix("😀"))
    }

    func test_isOverLimit_onlyBeyondTheCap() {
        XCTAssertFalse(ComposerPostTextPolicy.isOverLimit(String(repeating: "a", count: 5000)))
        XCTAssertTrue(ComposerPostTextPolicy.isOverLimit(String(repeating: "a", count: 5001)))
    }

    func test_documentDraft_neverCarriesMoreThanTheServerAccepts() {
        let sent = draft(text: String(repeating: "é", count: 9000)).text ?? ""
        XCTAssertEqual(ComposerPostTextPolicy.length(of: sent), 5000)
    }

    func test_documentDraft_shortTextIsUntouched() {
        XCTAssertEqual(draft(text: "Bonjour").text, "Bonjour")
    }
}
