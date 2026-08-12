import XCTest
@testable import MeeshySDK

/// stores-05 (option A — lecteur GRDB activé) : projection `PostRecord` →
/// `FeedPost` pour le fallback offline de pagination. La résolution Prisme
/// est PARTAGÉE avec `APIPost.toFeedPost` (`APIPost.resolveTranslation`) —
/// jamais dupliquée, sous peine de divergence silencieuse de langue.
final class PostRecordFeedPostMappingTests: XCTestCase {

    private func makeRecord(
        id: String = "p1",
        content: String? = "Hello",
        originalLanguage: String? = "en",
        translations: [String: APIPostTranslationEntry]? = nil
    ) -> PostRecord {
        PostRecord(
            id: id, authorId: "a1", authorUsername: "alice",
            authorDisplayName: "Alice", authorAvatarURL: nil,
            type: "POST", content: content, originalLanguage: originalLanguage,
            visibility: "PUBLIC",
            likeCount: 4, commentCount: 2, repostCount: 1,
            viewCount: 9, bookmarkCount: 3, shareCount: 5,
            isLikedByMe: true, isPinned: false, isEdited: false, isQuote: false,
            moodEmoji: nil, audioUrl: "https://cdn/a.m4a", audioDuration: nil,
            mediaJson: nil, reactionSummaryJson: nil, repostOfJson: nil,
            mentionedUsersJson: nil,
            translationsJson: translations.flatMap { try? JSONEncoder().encode($0) },
            createdAt: Date(timeIntervalSinceNow: -60), updatedAt: nil,
            changeVersion: 1, locationJson: nil
        )
    }

    private func makeTranslationEntry(text: String) throws -> APIPostTranslationEntry {
        try JSONDecoder().decode(
            APIPostTranslationEntry.self,
            from: Data(#"{"text":"\#(text)","translationModel":"nllb-200","confidenceScore":0.9}"#.utf8)
        )
    }

    func test_toFeedPost_mapsCoreFieldsAndCounters() {
        let record = makeRecord()

        let post = record.toFeedPost(preferredLanguages: [])

        XCTAssertEqual(post.id, "p1")
        XCTAssertEqual(post.author, "Alice")
        XCTAssertEqual(post.authorId, "a1")
        XCTAssertEqual(post.authorUsername, "alice")
        XCTAssertEqual(post.content, "Hello")
        XCTAssertEqual(post.likes, 4)
        XCTAssertEqual(post.commentCount, 2)
        XCTAssertEqual(post.repostCount, 1)
        XCTAssertEqual(post.bookmarkCount, 3)
        XCTAssertEqual(post.shareCount, 5)
        XCTAssertEqual(post.viewCount, 9)
        XCTAssertTrue(post.isLiked)
        XCTAssertEqual(post.audioUrl, "https://cdn/a.m4a")
    }

    func test_toFeedPost_resolvesPrismeTranslationLikeAPIPost() throws {
        let record = makeRecord(
            translations: ["fr": try makeTranslationEntry(text: "Bonjour")]
        )

        let post = record.toFeedPost(preferredLanguages: ["fr"])

        XCTAssertEqual(post.translatedContent, "Bonjour",
                       "la traduction persistée doit être résolue via la même règle Prisme que le réseau")
        XCTAssertEqual(post.translations?["fr"]?.text, "Bonjour")
    }

    /// Règle critique du Prisme : original déjà dans la langue préférée →
    /// nil, jamais un repli sur une autre traduction.
    func test_toFeedPost_originalAlreadyPreferred_returnsNilTranslation() throws {
        let record = makeRecord(
            originalLanguage: "fr",
            translations: ["en": try makeTranslationEntry(text: "Hello EN")]
        )

        let post = record.toFeedPost(preferredLanguages: ["fr"])

        XCTAssertNil(post.translatedContent,
                     "original déjà en langue préférée = pas de traduction appliquée")
    }
}
