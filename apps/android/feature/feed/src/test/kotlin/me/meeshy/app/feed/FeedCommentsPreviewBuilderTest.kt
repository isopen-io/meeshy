package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffectFlags
import org.junit.Test

/** #14314 — sous chaque carte du fil, les trois commentaires les plus aimés, dans la langue du lecteur (iOS `topComments`). */
class FeedCommentsPreviewBuilderTest {
    private val reader = MeeshyUser(id = "me", username = "moi", systemLanguage = "fr")

    private fun comment(id: String, likes: Int = 0, text: String = "texte $id", parentId: String? = null, effects: Int? = null, french: String? = null) =
        ApiPostComment(
            id = id, content = text, originalLanguage = "en", parentId = parentId, likeCount = likes, effectFlags = effects,
            author = ApiAuthor(id = "a-$id", username = "user$id", displayName = "Nom $id"),
            translations = french?.let { mapOf("fr" to ApiPostTranslationEntry(text = it)) },
        )

    private fun build(comments: List<ApiPostComment>?, count: Int = 0) =
        FeedCommentsPreviewBuilder.build(comments, count, reader, mediaBaseUrl = null)

    @Test
    fun `the three most liked comments lead, the next commenters show as faces`() {
        val preview = build(listOf(comment("a", 1), comment("b", 9), comment("c", 4), comment("d", 0), comment("e", 2)), count = 12)!!

        assertThat(preview.top.map { it.id }).containsExactly("b", "c", "e").inOrder()
        assertThat(preview.nextCommenters.map { it.id }).containsExactly("a", "d").inOrder()
        assertThat(preview.total).isEqualTo(12)
        assertThat(preview.top.first().authorName).isEqualTo("Nom b")
    }

    @Test
    fun `a comment reads in the reader language`() {
        val preview = build(listOf(comment("a", text = "Hello", french = "Bonjour")))!!

        assertThat(preview.top.single().text).isEqualTo("Bonjour")
    }

    @Test
    fun `a reply, a blurred or ephemeral comment and an empty text never show on the card`() {
        val preview = build(
            listOf(
                comment("reply", likes = 50, parentId = "x"),
                comment("blur", likes = 40, effects = MessageEffectFlags.BLURRED.toInt()),
                comment("empty", likes = 30, text = "  "),
                comment("ok", likes = 1),
            ),
        )!!

        assertThat(preview.top.map { it.id }).containsExactly("ok")
    }

    @Test
    fun `no readable comment draws nothing`() {
        assertThat(build(null)).isNull()
        assertThat(build(listOf(comment("reply", parentId = "x")))).isNull()
    }
}
