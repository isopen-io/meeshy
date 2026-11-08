package me.meeshy.sdk.model.comment

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import org.junit.Test

class CommentEditingTest {

    private fun comment(content: String = "Bonjour", flags: Int? = null, language: String? = "fr") = ApiPostComment(
        id = "c1",
        content = content,
        originalLanguage = language,
        effectFlags = flags,
        translations = mapOf("en" to ApiPostTranslationEntry(text = "Hello")),
        replyCount = 3,
    )

    @Test
    fun `editing seeds the text, the blur, the permanent effects and the language of the comment`() {
        val glow = MessageEffectFlags.GLOW
        val seed = CommentEditing.seed(comment(flags = (MessageEffectFlags.BLURRED or glow).toInt(), language = "ES"))

        assertThat(seed.text).isEqualTo("Bonjour")
        assertThat(seed.effects.flags).isEqualTo(MessageEffectFlags.BLURRED or glow)
        assertThat(seed.languageCode).isEqualTo("es")
    }

    @Test
    fun `a comment without a usable language seeds none, so the pill keeps what it shows`() {
        assertThat(CommentEditing.seed(comment(language = null)).languageCode).isNull()
        assertThat(CommentEditing.seed(comment(language = "  ")).languageCode).isNull()
    }

    @Test
    fun `the wire flags are explicit, zero clears the effects instead of leaving them`() {
        assertThat(CommentEditing.wireFlags(MessageEffects(flags = MessageEffectFlags.GLOW))).isEqualTo(MessageEffectFlags.GLOW.toInt())
        assertThat(CommentEditing.wireFlags(MessageEffects())).isEqualTo(0)
    }

    @Test
    fun `a changed text empties the translations, they described the old one`() {
        val edited = CommentEditing.edited(comment(), CommentEditRequest("c1", "Salut", 0, "fr"))
        assertThat(edited.content).isEqualTo("Salut")
        assertThat(edited.translations).isNull()
        assertThat(edited.effectFlags).isEqualTo(0)
    }

    @Test
    fun `an unchanged text keeps its translations`() {
        val edited = CommentEditing.edited(comment(), CommentEditRequest("c1", "Bonjour", 2, "fr"))
        assertThat(edited.translations).isNotNull()
        assertThat(edited.effectFlags).isEqualTo(2)
    }

    @Test
    fun `editing keeps everything else, the id, the counts and the media`() {
        val edited = CommentEditing.edited(comment(), CommentEditRequest("c1", "Salut", 0, "fr"))
        assertThat(edited.id).isEqualTo("c1")
        assertThat(edited.replyCount).isEqualTo(3)
    }

    @Test
    fun `an edit can be sent with a text or with media already attached`() {
        assertThat(CommentEditing.canSend("  ", hasMedia = false)).isFalse()
        assertThat(CommentEditing.canSend("  ", hasMedia = true)).isTrue()
        assertThat(CommentEditing.canSend(" a ", hasMedia = false)).isTrue()
    }
}
