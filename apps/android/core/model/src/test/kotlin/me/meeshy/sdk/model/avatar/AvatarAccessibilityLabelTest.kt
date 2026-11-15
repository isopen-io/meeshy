package me.meeshy.sdk.model.avatar

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AvatarAccessibilityLabelTest {

    private fun spoken(name: String, mood: String? = null, here: Boolean = false, fallback: String = "Avatar") =
        AvatarAccessibilityLabel.spokenName(name, mood, here, { "humeur $it" }, "Dans la conversation", fallback)

    @Test
    fun `le nom seul quand rien d'autre`() {
        assertThat(spoken("Ada")).isEqualTo("Ada")
    }

    @Test
    fun `nom, humeur puis dans la conversation`() {
        assertThat(spoken("Ada", mood = "😀", here = true)).isEqualTo("Ada, humeur 😀, Dans la conversation")
    }

    @Test
    fun `une humeur vide n'est pas lue`() {
        assertThat(spoken("Ada", mood = "")).isEqualTo("Ada")
    }

    @Test
    fun `un nom vide retombe sur le libelle de repli`() {
        assertThat(spoken("  ", here = true)).isEqualTo("Avatar, Dans la conversation")
    }
}
