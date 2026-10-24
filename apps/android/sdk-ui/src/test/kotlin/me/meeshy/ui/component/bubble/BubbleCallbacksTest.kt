package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BubbleCallbacksTest {

    @Test
    fun `None carries no callback so every bubble element stays inert`() {
        val none = BubbleCallbacks.None

        assertThat(none.onLongPress).isNull()
        assertThat(none.onReactionClick).isNull()
        assertThat(none.onReactionLongPress).isNull()
        assertThat(none.onImageClick).isNull()
        assertThat(none.onLocationClick).isNull()
        assertThat(none.onAudioClick).isNull()
        assertThat(none.onFileClick).isNull()
        assertThat(none.onReplyPreviewClick).isNull()
        assertThat(none.onFlagTap).isNull()
    }

    @Test
    fun `None equals a default-built set`() {
        assertThat(BubbleCallbacks()).isEqualTo(BubbleCallbacks.None)
    }

    @Test
    fun `copy changes a single callback and keeps the others`() {
        var longPresses = 0
        val flags = mutableListOf<String>()
        val base = BubbleCallbacks(onLongPress = { longPresses++ })

        val changed = base.copy(onFlagTap = { flags.add(it) })

        assertThat(changed.onLongPress).isSameInstanceAs(base.onLongPress)
        assertThat(changed.onReactionClick).isNull()
        changed.onFlagTap!!.invoke("fr")
        changed.onLongPress!!.invoke()
        assertThat(flags).containsExactly("fr")
        assertThat(longPresses).isEqualTo(1)
        assertThat(base.onFlagTap).isNull()
    }
}
