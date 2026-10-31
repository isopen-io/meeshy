package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.card.PostCommentCardComposition
import me.meeshy.sdk.model.card.PostCommentCardLabels
import me.meeshy.sdk.model.card.PostCommentCardMediaKind
import me.meeshy.sdk.model.card.PostCommentCardPart
import org.junit.Test

/**
 * #13922 — ce que le fil remet à la composition de la carte d'un commentaire (iOS `PostCommentCardSource.reading`) : le
 * texte que la rangée visée AFFICHE, le fil servi par le Prisme, le post tel qu'il est servi, son audience et ses médias.
 */
class CommentCardReadingTest {

    private val labels = PostCommentCardLabels(thread = "Fil de commentaires", folded = { "+$it réponses" })
    private val reader = MeeshyUser(id = "me", username = "moi", displayName = "Moi", systemLanguage = "fr")

    private fun post(visibility: String? = "PUBLIC", media: List<ApiPostMedia>? = null) = ApiPost(
        id = "p1",
        type = "POST",
        visibility = visibility,
        content = "Sunset in Dakar",
        createdAt = "2026-10-31T10:00:00.000Z",
        author = ApiAuthor(id = "awa", username = "awa", displayName = "Awa"),
        media = media,
    )

    private fun comment(id: String, content: String, minute: Int, parent: String? = null, flags: Int? = null, french: String? = null) = ApiPostComment(
        id = id,
        content = content,
        originalLanguage = "en",
        parentId = parent,
        translations = french?.let { mapOf("fr" to ApiPostTranslationEntry(text = it)) },
        effectFlags = flags,
        createdAt = "2026-10-31T10:%02d:00.000Z".format(minute),
        author = ApiAuthor(id = id.uppercase(), username = id, displayName = id.replaceFirstChar { it.uppercase() }),
    )

    private val root = comment("bob", "Beautiful!", 1, french = "Magnifique !")
    private val reply = comment("cleo", "Where were you?", 2, parent = "bob", french = "Tu étais où ?")

    @Test
    fun `the support carries its served text, its audience and the media a card can name`() {
        val media = listOf(
            ApiPostMedia(id = "v", mimeType = "video/mp4", order = 1),
            ApiPostMedia(id = "doc", mimeType = "application/pdf", order = 2),
            ApiPostMedia(id = "i", mimeType = "image/jpeg", order = 0),
        )
        val support = CommentCardReading.support(post(visibility = "FRIENDS", media = media), servedText = "Coucher de soleil à Dakar")

        assertThat(support.text).isEqualTo("Coucher de soleil à Dakar")
        assertThat(support.visibility).isEqualTo("FRIENDS")
        assertThat(support.media.map { it.id to it.kind }).containsExactly("i" to PostCommentCardMediaKind.IMAGE, "v" to PostCommentCardMediaKind.VIDEO).inOrder()
    }

    @Test
    fun `the targeted comment reads as its row shows it, the thread through the Prisme`() {
        val source = CommentCardReading.source(
            target = reply, shownText = "Where were you?", loaded = listOf(root, reply), pending = emptySet(),
            support = CommentCardReading.support(post(), "Coucher de soleil à Dakar"), viewer = reader, preferences = reader,
        )
        val card = PostCommentCardComposition.cardOf(source, labels)

        assertThat(card?.quoted).isEqualTo(PostCommentCardPart("Bob", "Magnifique !", "bob"))
        assertThat(card?.reply).isEqualTo(PostCommentCardPart("Cleo", "Where were you?", "cleo"))
        assertThat(source.thread.map { it.id }).containsExactly("bob")
        assertThat(source.viewer.displayName).isEqualTo("Moi")
    }

    @Test
    fun `a pending or protected comment never images, and a restricted post stays off the card`() {
        val support = CommentCardReading.support(post(visibility = "PRIVATE"), "Coucher de soleil")
        val pending = CommentCardReading.source(root, null, listOf(root), pending = setOf("bob"), support = null, viewer = reader, preferences = reader)
        val viewOnce = comment("eve", "Secret", 3, flags = 4)
        val restricted = CommentCardReading.source(root, null, listOf(root), emptySet(), support, reader, reader)

        assertThat(PostCommentCardComposition.cardOf(pending, labels)).isNull()
        assertThat(PostCommentCardComposition.cardOf(CommentCardReading.source(viewOnce, null, listOf(viewOnce), emptySet(), null, reader, reader), labels)).isNull()
        assertThat(PostCommentCardComposition.cardOf(restricted, labels)?.quoted).isNull()
        assertThat(PostCommentCardComposition.withheldByAudience(restricted)).isTrue()
    }
}
