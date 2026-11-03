package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.scene.StoryBackdrop
import me.meeshy.sdk.model.scene.SceneBackdropChoice.Choice
import me.meeshy.sdk.model.scene.SceneBackdropChoice.Source
import org.junit.Test

class SceneBackdropChoiceTest {
    @Test
    fun `le bitmap pose prime sur le hash, le hash sert au demarrage a froid`() {
        assertThat(SceneBackdropChoice.source(true, listOf("h"))).isEqualTo(Source.StampedBitmap)
        assertThat(SceneBackdropChoice.source(false, listOf("", "h2"))).isEqualTo(Source.ThumbHash("h2"))
        assertThat(SceneBackdropChoice.source(false, emptyList())).isEqualTo(Source.None)
    }

    @Test
    fun `le drapeau de service exige le mode ajuste et une matiere`() {
        assertThat(SceneBackdropChoice.isServed("fit", true)).isTrue()
        assertThat(SceneBackdropChoice.isServed("fit", false)).isFalse()
        assertThat(SceneBackdropChoice.isServed("fill", true)).isFalse()
        assertThat(SceneBackdropChoice.isServed(null, true)).isFalse()
    }

    @Test
    fun `une teinte unie peint les bandes sans matiere`() {
        assertThat(SceneBackdropChoice.choose("fit", StoryBackdrop.INDIGO, false, emptyList())).isEqualTo(Choice.Solid("312E81"))
    }

    @Test
    fun `le flou tire du hash puis du bitmap`() {
        assertThat(SceneBackdropChoice.choose("fit", StoryBackdrop.BLUR, false, listOf("h"))).isEqualTo(Choice.Blur(Source.ThumbHash("h")))
        assertThat(SceneBackdropChoice.choose("fit", StoryBackdrop.BLUR, true, listOf("h"))).isEqualTo(Choice.Blur(Source.StampedBitmap))
    }

    @Test
    fun `rempli, supprime ou sans matiere rien n est peint`() {
        assertThat(SceneBackdropChoice.choose("fill", StoryBackdrop.BLUR, true, listOf("h"))).isEqualTo(Choice.Nothing)
        assertThat(SceneBackdropChoice.choose("fill", StoryBackdrop.SAND, true, emptyList())).isEqualTo(Choice.Nothing)
        assertThat(SceneBackdropChoice.choose("fit", StoryBackdrop.BLUR, true, listOf("h"), suppressed = true)).isEqualTo(Choice.Nothing)
        assertThat(SceneBackdropChoice.choose("fit", StoryBackdrop.SAND, true, emptyList(), suppressed = true)).isEqualTo(Choice.Nothing)
        assertThat(SceneBackdropChoice.choose("fit", StoryBackdrop.BLUR, false, emptyList())).isEqualTo(Choice.Nothing)
    }

    @Test
    fun `le bitmap est reduit a 32 px sans jamais etre agrandi`() {
        assertThat(SceneBackdropChoice.downsampledSize(1920, 1080)).isEqualTo(32 to 18)
        assertThat(SceneBackdropChoice.downsampledSize(16, 8)).isEqualTo(16 to 8)
        assertThat(SceneBackdropChoice.downsampledSize(4000, 10)).isEqualTo(32 to 1)
        assertThat(SceneBackdropChoice.downsampledSize(0, 10)).isNull()
    }
}
