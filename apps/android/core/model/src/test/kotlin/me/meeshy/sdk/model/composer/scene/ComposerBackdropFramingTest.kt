package me.meeshy.sdk.model.composer.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryBackgroundTransform
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class ComposerBackdropFramingTest {

    @Test
    fun `l absence de cadrage se rend REMPLIE et le cycle alterne entre deux etats`() {
        assertThat(StoryBackgroundFraming.rendersFilled(null)).isTrue()
        assertThat(StoryBackgroundFraming.rendersFilled("fill")).isTrue()
        assertThat(StoryBackgroundFraming.rendersFilled("inconnu")).isTrue()
        assertThat(StoryBackgroundFraming.rendersFilled("fit")).isFalse()
        assertThat(StoryBackgroundFraming.nextFitMode(null)).isEqualTo("fit")
        assertThat(StoryBackgroundFraming.nextFitMode("fit")).isEqualTo("fill")
        assertThat(StoryBackgroundFraming.nextFitMode("fill")).isEqualTo("fit")
    }

    @Test
    fun `un media neuf est pose AJUSTE sauf choix deja fait sur la scene`() {
        assertThat(StoryBackgroundFraming.posedFitMode(null)).isEqualTo("fit")
        assertThat(StoryBackgroundFraming.posedFitMode("fill")).isEqualTo("fill")
    }

    @Test
    fun `un fond inconnu ou absent rend le flou et les teintes sont le contrat web`() {
        assertThat(StoryBackdrop.resolve(null)).isEqualTo(StoryBackdrop.BLUR)
        assertThat(StoryBackdrop.resolve("rose")).isEqualTo(StoryBackdrop.BLUR)
        assertThat(StoryBackdrop.BLUR.solidHex).isNull()
        assertThat(StoryBackdrop.entries.map { it.wire })
            .containsExactly("blur", "black", "white", "indigo", "sand").inOrder()
        assertThat(StoryBackdrop.SAND.solidHex).isEqualTo("FDE68A")
        assertThat(StoryBackdrop.INDIGO.solidHex).isEqualTo("312E81")
    }

    @Test
    fun `lire le cadrage et le fond d un transform absent`() {
        assertThat(ComposerBackdropFraming.fitMode(null)).isEqualTo("fill")
        assertThat(ComposerBackdropFraming.fitMode(StoryBackgroundTransform(videoFitMode = "fit"))).isEqualTo("fit")
        assertThat(ComposerBackdropFraming.backdrop(null)).isEqualTo(StoryBackdrop.BLUR)
        assertThat(ComposerBackdropFraming.backdrop(StoryBackgroundTransform(backdrop = "sand")))
            .isEqualTo(StoryBackdrop.SAND)
    }

    @Test
    fun `choisir un fond AJUSTE la scene sinon le geste serait inerte`() {
        val next = ComposerBackdropFraming.applyingBackdrop(
            StoryBackdrop.BLACK,
            StoryBackgroundTransform(videoFitMode = "fill"),
        )!!
        assertThat(next.backdrop).isEqualTo("black")
        assertThat(next.videoFitMode).isEqualTo("fit")
    }

    @Test
    fun `un transform redevenu identite est retire plutot que garde vide`() {
        assertThat(StoryBackgroundTransform().isIdentity).isTrue()
        assertThat(StoryBackgroundTransform(scale = 1.0, offsetX = 0.0).isIdentity).isTrue()
        assertThat(StoryBackgroundTransform(videoFitMode = "fit").isIdentity).isFalse()
        assertThat(StoryBackgroundTransform(backdrop = "blur").isIdentity).isFalse()
        assertThat(ComposerBackdropFraming.applyingFitMode("fit", null)!!.videoFitMode).isEqualTo("fit")
    }
}
