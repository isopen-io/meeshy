package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiPostTranslationEntry
import org.junit.Test

/**
 * Projects a raw [ApiPostComment] into the immutable [CommentPresentation] the Compose
 * layer renders — author display name, avatar URL resolution, Prisme-resolved content,
 * reply awareness, and the optimistic-pending flag. Prisme parity with the feed post.
 */
class CommentProjectionTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun comment(
        id: String = "c1",
        content: String = "Bonjour",
        parentId: String? = null,
        author: ApiAuthor? = ApiAuthor(id = "u1", username = "alice", displayName = "Alice"),
        translations: Map<String, ApiPostTranslationEntry>? = null,
        likeCount: Int? = null,
        replyCount: Int? = null,
        createdAt: String? = "2026-07-17T10:00:00Z",
    ) = ApiPostComment(
        id = id,
        content = content,
        originalLanguage = "fr",
        parentId = parentId,
        author = author,
        translations = translations,
        likeCount = likeCount,
        replyCount = replyCount,
        createdAt = createdAt,
    )

    @Test
    fun build_prefersDisplayNameThenUsername() {
        assertThat(CommentProjection.build(comment(), Prefs(), null).authorName).isEqualTo("Alice")
        val noDisplay = comment(author = ApiAuthor(id = "u1", username = "alice", displayName = null))
        assertThat(CommentProjection.build(noDisplay, Prefs(), null).authorName).isEqualTo("alice")
    }

    @Test
    fun build_blankAuthorNameBecomesNull() {
        val anon = comment(author = ApiAuthor(id = "u1", username = "  ", displayName = "  "))
        assertThat(CommentProjection.build(anon, Prefs(), null).authorName).isNull()
        val noAuthor = comment(author = null)
        assertThat(CommentProjection.build(noAuthor, Prefs(), null).authorName).isNull()
    }

    @Test
    fun build_resolvesRelativeAvatarAgainstBase() {
        val c = comment(author = ApiAuthor(id = "u1", username = "a", avatar = "/uploads/a.png"))
        val p = CommentProjection.build(c, Prefs(), "https://gate.meeshy.me")
        assertThat(p.authorAvatarUrl).isEqualTo("https://gate.meeshy.me/uploads/a.png")
    }

    @Test
    fun build_keepsAbsoluteAvatarAndNullsBlank() {
        val abs = comment(author = ApiAuthor(id = "u1", username = "a", avatar = "https://cdn/x.png"))
        assertThat(CommentProjection.build(abs, Prefs(), "https://gate").authorAvatarUrl)
            .isEqualTo("https://cdn/x.png")
        val blank = comment(author = ApiAuthor(id = "u1", username = "a", avatar = "  "))
        assertThat(CommentProjection.build(blank, Prefs(), "https://gate").authorAvatarUrl).isNull()
    }

    @Test
    fun build_appliesPrismeTranslation() {
        val c = comment(translations = mapOf("en" to ApiPostTranslationEntry(text = "Hello")))
        val p = CommentProjection.build(c, Prefs(systemLanguage = "en"), null)
        assertThat(p.content).isEqualTo("Hello")
        assertThat(p.isTranslated).isTrue()
    }

    @Test
    fun build_showsOriginalWhenNoPreferredTranslation() {
        val c = comment(translations = mapOf("en" to ApiPostTranslationEntry(text = "Hello")))
        val p = CommentProjection.build(c, Prefs(systemLanguage = "de"), null)
        assertThat(p.content).isEqualTo("Bonjour")
        assertThat(p.isTranslated).isFalse()
    }

    @Test
    fun build_marksReplyWhenParentPresent() {
        assertThat(CommentProjection.build(comment(parentId = "p1"), Prefs(), null).isReply).isTrue()
        assertThat(CommentProjection.build(comment(parentId = "p1"), Prefs(), null).parentId).isEqualTo("p1")
        assertThat(CommentProjection.build(comment(parentId = "  "), Prefs(), null).isReply).isFalse()
        assertThat(CommentProjection.build(comment(parentId = null), Prefs(), null).isReply).isFalse()
    }

    @Test
    fun build_coercesNullCountsToZero() {
        val p = CommentProjection.build(comment(likeCount = null, replyCount = null), Prefs(), null)
        assertThat(p.likeCount).isEqualTo(0)
        assertThat(p.replyCount).isEqualTo(0)
        val counted = CommentProjection.build(comment(likeCount = 3, replyCount = 5), Prefs(), null)
        assertThat(counted.likeCount).isEqualTo(3)
        assertThat(counted.replyCount).isEqualTo(5)
    }

    @Test
    fun build_carriesPendingFlagAndCreatedAt() {
        val pending = CommentProjection.build(comment(), Prefs(), null, isPending = true)
        assertThat(pending.isPending).isTrue()
        assertThat(pending.createdAtIso).isEqualTo("2026-07-17T10:00:00Z")
        assertThat(CommentProjection.build(comment(), Prefs(), null).isPending).isFalse()
    }

    @Test
    fun build_defaultsToNotLikedWithBaseCount() {
        val p = CommentProjection.build(comment(likeCount = 4), Prefs(), null)
        assertThat(p.isLiked).isFalse()
        assertThat(p.likeCount).isEqualTo(4)
    }

    @Test
    fun build_reflectsOptimisticLikeStateAndCount() {
        val liked = CommentLikeState().beginToggle("c1")!!
        val p = CommentProjection.build(comment(id = "c1", likeCount = 2), Prefs(), null, likeState = liked)
        assertThat(p.isLiked).isTrue()
        assertThat(p.likeCount).isEqualTo(3)
    }

    @Test
    fun build_reflectsOptimisticUnlikeCount() {
        val unliked = CommentLikeState()
            .seeded(listOf(ApiPostComment(id = "c1", currentUserReactions = listOf("❤️"))), "❤️")
            .beginToggle("c1")!!
        val p = CommentProjection.build(comment(id = "c1", likeCount = 5), Prefs(), null, likeState = unliked)
        assertThat(p.isLiked).isFalse()
        assertThat(p.likeCount).isEqualTo(4)
    }
}
