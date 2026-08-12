import XCTest
import MeeshySDK
@testable import Meeshy

/// W4 lot 6 — `post:translation-updated` et `comment:translation-updated`
/// n'écrivaient que sous « main-feed ». Un post vit sous PLUSIEURS clés
/// (main-feed, sa clé détail, bookmarks, pager reels) : la traduction
/// disparaissait dès qu'une autre surface servait le post depuis le cache.
@MainActor
final class FeedTranslationPatchTests: XCTestCase {

    private func makePost(
        id: String = "p1",
        comments: [FeedComment] = [],
        translations: [String: PostTranslation]? = nil,
        translatedContent: String? = nil
    ) -> FeedPost {
        FeedPost(
            id: id, author: "alice", authorId: "a1", content: "Bonjour",
            comments: comments, originalLanguage: "fr",
            translations: translations, translatedContent: translatedContent
        )
    }

    private func makeComment(id: String, translatedContent: String? = nil) -> FeedComment {
        FeedComment(id: id, author: "bob", authorId: "b1", content: "Salut",
                    translatedContent: translatedContent)
    }

    // MARK: - Post

    func test_applyPostTranslation_storesTheTranslationForEveryLanguage() {
        var post = makePost()

        FeedViewModel.applyPostTranslation(
            PostTranslation(text: "Hello"), language: "en",
            preferredLanguages: ["de"], to: &post
        )

        XCTAssertEqual(post.translations?["en"]?.text, "Hello")
        XCTAssertNil(post.translatedContent, "une langue non préférée ne doit pas devenir le contenu affiché")
    }

    func test_applyPostTranslation_preferredLanguage_becomesDisplayedContent() {
        var post = makePost()

        FeedViewModel.applyPostTranslation(
            PostTranslation(text: "Hello"), language: "EN",
            preferredLanguages: ["en"], to: &post
        )

        XCTAssertEqual(post.translatedContent, "Hello", "la comparaison de langue est insensible à la casse")
    }

    func test_applyPostTranslation_neverOverwritesAnAlreadyDisplayedTranslation() {
        var post = makePost(translatedContent: "Déjà traduit")

        FeedViewModel.applyPostTranslation(
            PostTranslation(text: "Hello"), language: "en",
            preferredLanguages: ["en"], to: &post
        )

        XCTAssertEqual(post.translatedContent, "Déjà traduit")
        XCTAssertEqual(post.translations?["en"]?.text, "Hello")
    }

    func test_applyPostTranslation_isIdempotent() {
        var post = makePost()
        let translation = PostTranslation(text: "Hello")

        FeedViewModel.applyPostTranslation(translation, language: "en",
                                           preferredLanguages: ["en"], to: &post)
        var replayed = post
        FeedViewModel.applyPostTranslation(translation, language: "en",
                                           preferredLanguages: ["en"], to: &replayed)

        XCTAssertEqual(replayed.translations?.count, post.translations?.count)
        XCTAssertEqual(replayed.translatedContent, post.translatedContent)
    }

    // MARK: - Comment

    func test_applyCommentTranslation_preferredLanguage_setsTranslatedContent() {
        var post = makePost(comments: [makeComment(id: "c1")])

        let changed = FeedViewModel.applyCommentTranslation(
            "Hi", commentId: "c1", language: "en", preferredLanguages: ["en"], to: &post
        )

        XCTAssertTrue(changed)
        XCTAssertEqual(post.comments.first?.translatedContent, "Hi")
    }

    func test_applyCommentTranslation_nonPreferredLanguage_isANoOp() {
        var post = makePost(comments: [makeComment(id: "c1")])

        let changed = FeedViewModel.applyCommentTranslation(
            "Hi", commentId: "c1", language: "en", preferredLanguages: ["fr"], to: &post
        )

        XCTAssertFalse(changed)
        XCTAssertNil(post.comments.first?.translatedContent)
    }

    func test_applyCommentTranslation_unknownComment_isANoOp() {
        var post = makePost(comments: [makeComment(id: "c1")])

        let changed = FeedViewModel.applyCommentTranslation(
            "Hi", commentId: "ghost", language: "en", preferredLanguages: ["en"], to: &post
        )

        XCTAssertFalse(changed)
    }

    func test_applyCommentTranslation_alreadyTranslated_isANoOp() {
        var post = makePost(comments: [makeComment(id: "c1", translatedContent: "Déjà")])

        let changed = FeedViewModel.applyCommentTranslation(
            "Hi", commentId: "c1", language: "en", preferredLanguages: ["en"], to: &post
        )

        XCTAssertFalse(changed)
        XCTAssertEqual(post.comments.first?.translatedContent, "Déjà")
    }

    // MARK: - Multi-clés

    /// La preuve du lot : la même règle appliquée par `patchEverywhere` touche
    /// TOUTES les clés qui portent le post, pas seulement « main-feed ».
    func test_patchEverywhere_appliesTheTranslationUnderEveryCacheKey() async throws {
        let cache = CacheCoordinator.shared
        let post = makePost(id: "p-multi")
        for key in ["main-feed", "p-multi", "bookmarks"] {
            await cache.feed.invalidate(for: key)
            try await cache.feed.save([post], for: key)
        }

        let translation = PostTranslation(text: "Hello")
        await cache.feed.patchEverywhere(itemId: "p-multi") {
            FeedViewModel.applyPostTranslation(translation, language: "en",
                                               preferredLanguages: ["en"], to: &$0)
        }

        for key in ["main-feed", "p-multi", "bookmarks"] {
            let cached = await cache.feed.load(for: key).snapshot()?.first
            XCTAssertEqual(cached?.translatedContent, "Hello", "clé \(key) non patchée")
        }
    }
}
