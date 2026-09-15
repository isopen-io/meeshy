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
        media: [FeedMedia] = [],
        translations: [String: PostTranslation]? = nil,
        translatedContent: String? = nil
    ) -> FeedPost {
        var post = FeedPost(
            id: id, author: "alice", authorId: "a1", content: "Bonjour",
            comments: comments, originalLanguage: "fr",
            translations: translations, translatedContent: translatedContent
        )
        post.media = media
        return post
    }

    private func makeComment(
        id: String,
        originalLanguage: String? = nil,
        translatedContent: String? = nil
    ) -> FeedComment {
        FeedComment(id: id, author: "bob", authorId: "b1", content: "Salut",
                    originalLanguage: originalLanguage, translatedContent: translatedContent)
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

    /// Un choix MANUEL du lecteur (`setTranslationOverride`, tap d'un
    /// drapeau) n'est jamais écrasé par une traduction qui arrive ensuite —
    /// elle est mergée dans `translations`, l'affichage n'est pas retouché.
    func test_applyPostTranslation_manualOverride_isNotOverwritten() {
        var post = makePost(translatedContent: "Déjà traduit")

        FeedViewModel.applyPostTranslation(
            PostTranslation(text: "Hello"), language: "en",
            preferredLanguages: ["en"], preserveManualOverride: true, to: &post
        )

        XCTAssertEqual(post.translatedContent, "Déjà traduit")
        XCTAssertEqual(post.translations?["en"]?.text, "Hello")
    }

    /// #6531 — la langue d'origine concourt à SON rang, jamais en
    /// court-circuit : Prisme `[fr, pt]`, original `fr`, une traduction `pt`
    /// arrive (rang 2) → le français (rang 1, l'original) reste affiché.
    func test_applyPostTranslation_originalLanguageAtItsRank_winsOverLowerRankTranslation() {
        var post = makePost() // originalLanguage: "fr", pas encore de translatedContent

        FeedViewModel.applyPostTranslation(
            PostTranslation(text: "Olá"), language: "pt",
            preferredLanguages: ["fr", "pt"], to: &post
        )

        XCTAssertNil(post.translatedContent, "le français (rang 1, langue d'origine) doit primer sur le portugais")
        XCTAssertEqual(post.translations?["pt"]?.text, "Olá")
    }

    /// #6531 — l'ORDRE D'ARRIVÉE entre deux traductions ne doit pas décider du
    /// rang affiché : Prisme `[en, pt]`, `pt` arrive puis `en` → `en` gagne,
    /// car il occupe le rang 1, malgré son arrivée après `pt`.
    func test_applyPostTranslation_arrivalOrderDoesNotDecideTheDisplayedRank() {
        var post = makePost() // originalLanguage "fr", hors Prisme ["en", "pt"]

        FeedViewModel.applyPostTranslation(
            PostTranslation(text: "Olá"), language: "pt",
            preferredLanguages: ["en", "pt"], to: &post
        )
        XCTAssertEqual(post.translatedContent, "Olá", "pt est seul disponible pour l'instant")

        FeedViewModel.applyPostTranslation(
            PostTranslation(text: "Hello"), language: "en",
            preferredLanguages: ["en", "pt"], to: &post
        )
        XCTAssertEqual(post.translatedContent, "Hello", "en gagne car il occupe le rang 1")
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

    /// #6531 — même garde que `applyPostTranslation` : la langue d'origine du
    /// commentaire, quand elle occupe un rang au moins aussi prioritaire que
    /// la traduction qui arrive, n'est pas détrônée.
    func test_applyCommentTranslation_originalLanguageAtHigherRank_isNotOverwritten() {
        var post = makePost(comments: [makeComment(id: "c1", originalLanguage: "fr")])

        let changed = FeedViewModel.applyCommentTranslation(
            "Hi", commentId: "c1", language: "en", preferredLanguages: ["fr", "en"], to: &post
        )

        XCTAssertFalse(changed)
        XCTAssertNil(post.comments.first?.translatedContent)
    }

    func test_applyCommentTranslation_translationRankedAboveOriginal_isApplied() {
        var post = makePost(comments: [makeComment(id: "c1", originalLanguage: "fr")])

        let changed = FeedViewModel.applyCommentTranslation(
            "Hi", commentId: "c1", language: "en", preferredLanguages: ["en", "fr"], to: &post
        )

        XCTAssertTrue(changed)
        XCTAssertEqual(post.comments.first?.translatedContent, "Hi")
    }

    func test_applyCommentTranslation_alreadyTranslated_isANoOp() {
        var post = makePost(comments: [makeComment(id: "c1", translatedContent: "Déjà")])

        let changed = FeedViewModel.applyCommentTranslation(
            "Hi", commentId: "c1", language: "en", preferredLanguages: ["en"], to: &post
        )

        XCTAssertFalse(changed)
        XCTAssertEqual(post.comments.first?.translatedContent, "Déjà")
    }

    // MARK: - Média (légende, #6280)

    func test_applyMediaCaptionTranslation_onPostMedia_storesTranslation() {
        var post = makePost(media: [FeedMedia(id: "m1", type: .image, caption: "Sunset")])

        let changed = FeedViewModel.applyMediaCaptionTranslation(
            "Coucher de soleil", mediaId: "m1", commentId: nil, language: "fr", to: &post
        )

        XCTAssertTrue(changed)
        XCTAssertEqual(post.media.first?.captionTranslations?["fr"], "Coucher de soleil")
    }

    func test_applyMediaCaptionTranslation_onCommentMedia_storesTranslation() {
        let comment = FeedComment(
            id: "c1", author: "bob", authorId: "b1", content: "Salut",
            media: [FeedMedia(id: "m1", type: .image, caption: "Sunset")]
        )
        var post = makePost(comments: [comment])

        let changed = FeedViewModel.applyMediaCaptionTranslation(
            "Coucher de soleil", mediaId: "m1", commentId: "c1", language: "fr", to: &post
        )

        XCTAssertTrue(changed)
        XCTAssertEqual(post.comments.first?.media.first?.captionTranslations?["fr"], "Coucher de soleil")
        XCTAssertTrue(post.media.isEmpty, "le média d'un commentaire ne doit jamais atterrir sur le post porteur")
    }

    func test_applyMediaCaptionTranslation_unknownMedia_isANoOp() {
        var post = makePost(media: [FeedMedia(id: "m1", type: .image, caption: "Sunset")])

        let changed = FeedViewModel.applyMediaCaptionTranslation(
            "Coucher de soleil", mediaId: "ghost", commentId: nil, language: "fr", to: &post
        )

        XCTAssertFalse(changed)
        XCTAssertNil(post.media.first?.captionTranslations)
    }

    func test_applyMediaCaptionTranslation_isIdempotentAndMergesLanguages() {
        var post = makePost(media: [FeedMedia(id: "m1", type: .image, caption: "Sunset")])

        _ = FeedViewModel.applyMediaCaptionTranslation("Coucher de soleil", mediaId: "m1", commentId: nil, language: "fr", to: &post)
        _ = FeedViewModel.applyMediaCaptionTranslation("Atardecer", mediaId: "m1", commentId: nil, language: "es", to: &post)
        _ = FeedViewModel.applyMediaCaptionTranslation("Coucher de soleil", mediaId: "m1", commentId: nil, language: "fr", to: &post)

        XCTAssertEqual(post.media.first?.captionTranslations?["fr"], "Coucher de soleil")
        XCTAssertEqual(post.media.first?.captionTranslations?["es"], "Atardecer")
        XCTAssertEqual(post.media.first?.captionTranslations?.count, 2)
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
