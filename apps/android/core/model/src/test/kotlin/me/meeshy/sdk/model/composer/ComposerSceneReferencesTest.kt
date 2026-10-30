package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PostMentionInput
import org.junit.Test

/** Le pied de scène et la mention épinglée (#13846, iOS `ComposerSceneReferences` + `ReferenceNoteRow.noted`). */
class ComposerSceneReferencesTest {

    private fun mention(username: String, display: String?, userId: String? = "id-$username") =
        PostMentionInput(userId = userId, username = username, display = display)

    @Test
    fun `only the referenced mentions reach the footer, never an inline, pinned or silent one`() {
        val all = listOf(
            mention("ana", "NOTE"),
            mention("bob", "SILENT"),
            mention("cid", "PINNED"),
            mention("dan", "INLINE"),
            mention("eve", null),
        )
        assertThat(ComposerSceneReferences.noted(all).map { it.username }).containsExactly("ana")
    }

    @Test
    fun `the footer is absent when it carries nothing`() {
        assertThat(ComposerSceneReferences.isServed(hashtags = emptyList(), mentions = emptyList())).isFalse()
        assertThat(ComposerSceneReferences.isServed(hashtags = emptyList(), mentions = listOf(mention("bob", "SILENT")))).isFalse()
        assertThat(ComposerSceneReferences.isServed(hashtags = listOf("voyage"), mentions = emptyList())).isTrue()
        assertThat(ComposerSceneReferences.isServed(hashtags = emptyList(), mentions = listOf(mention("ana", "NOTE")))).isTrue()
    }

    @Test
    fun `hashtags are spoken without their sign`() {
        assertThat(ComposerSceneReferences.spoken("Hashtags", listOf("voyage", "mer"))).isEqualTo("Hashtags : voyage, mer")
        assertThat(ComposerSceneReferences.spoken("Hashtags", emptyList())).isEqualTo("Hashtags")
    }

    @Test
    fun `a badge on the slide declares its person PINNED, once, over any other mode`() {
        val declared = listOf(mention("ana", "NOTE"), mention("bob", "SILENT"))
        val badges = listOf(
            ComposerSceneReferences.Badge(userId = "id-ana", username = "Ana"),
            ComposerSceneReferences.Badge(userId = "id-cid", username = "cid"),
            ComposerSceneReferences.Badge(userId = "id-cid", username = "cid"),
        )
        val sent = ComposerSceneReferences.declaredFor(declared, badges)
        assertThat(sent).containsExactly(
            PostMentionInput(userId = "id-ana", username = "Ana", display = "PINNED"),
            PostMentionInput(userId = "id-cid", username = "cid", display = "PINNED"),
            mention("bob", "SILENT"),
        ).inOrder()
    }

    @Test
    fun `a pinned mention whose badge left the slide is no longer declared`() {
        val sent = ComposerSceneReferences.declaredFor(listOf(mention("ana", "PINNED"), mention("bob", "NOTE")), badges = emptyList())
        assertThat(sent.map { it.username }).containsExactly("bob")
    }

    @Test
    fun `the declaration never exceeds the gateway cap`() {
        val badges = (1..60).map { ComposerSceneReferences.Badge(userId = "u$it", username = "p$it") }
        assertThat(ComposerSceneReferences.declaredFor(emptyList(), badges)).hasSize(ComposerSceneReferences.MAX_MENTIONS)
    }
}
