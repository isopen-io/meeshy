package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryComposingFocusTest {
    @Test
    fun `le chrome n'est peint que visible et hors saisie`() {
        assertThat(StoryComposingFocus.showsChrome(chromeVisible = true, isComposing = false)).isTrue()
        assertThat(StoryComposingFocus.showsChrome(chromeVisible = true, isComposing = true)).isFalse()
        assertThat(StoryComposingFocus.showsChrome(chromeVisible = false, isComposing = false)).isFalse()
        assertThat(StoryComposingFocus.showsChrome(chromeVisible = false, isComposing = true)).isFalse()
    }

    @Test
    fun `les decorations du contenu se taisent pendant la saisie seulement`() {
        assertThat(StoryComposingFocus.showsContentDecorations(isComposing = false)).isTrue()
        assertThat(StoryComposingFocus.showsContentDecorations(isComposing = true)).isFalse()
    }

    @Test
    fun `le fondu dure 0,2 s`() {
        assertThat(StoryComposingFocus.FADE_MILLIS).isEqualTo(200)
    }
}
