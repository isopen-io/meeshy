package me.meeshy.sdk.model.composer.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTransitionEffect
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneFrameTest {

    @Test
    fun `une slide neuve n a aucun cadrage, aucune ouverture et ne publie aucun transform`() {
        val frame = SceneFrame()
        assertThat(frame.isNeutral).isTrue()
        assertThat(frame.backgroundTransform()).isNull()
    }

    @Test
    fun `choisir le cadrage ou le fond ecrit le transform du fond, que le web et iOS lisent`() {
        val fitted = SceneFrame().withFitMode("fit")
        assertThat(fitted.backgroundTransform()!!.videoFitMode).isEqualTo("fit")
        val dark = fitted.withBackdrop(StoryBackdrop.BLACK)
        assertThat(dark.backgroundTransform()!!.backdrop).isEqualTo("black")
        assertThat(dark.fitMode).isEqualTo("fit")
        assertThat(dark.isNeutral).isFalse()
    }

    @Test
    fun `un fond force le cadrage ajuste, sinon le geste serait inerte`() {
        val frame = SceneFrame(fitMode = "fill").withBackdrop(StoryBackdrop.SAND)
        assertThat(frame.fitMode).isEqualTo("fit")
    }

    @Test
    fun `un choix de carrousel touche sa transition seule, le visuel ne touche pas au cadre`() {
        val frame = SceneFrame(opening = StoryTransitionEffect.FADE, closing = StoryTransitionEffect.ZOOM)
        assertThat(frame.applying(SceneEffectChoice.Closing(null)))
            .isEqualTo(SceneFrame(opening = StoryTransitionEffect.FADE))
        assertThat(frame.applying(SceneEffectChoice.Opening(StoryTransitionEffect.REVEAL)).opening)
            .isEqualTo(StoryTransitionEffect.REVEAL)
        assertThat(frame.applying(SceneEffectChoice.Visual("bw"))).isEqualTo(frame)
    }

    @Test
    fun `les transitions voyagent sous leur nom de fil et une valeur inconnue est lue comme absente`() {
        assertThat(StoryTransitionEffect.entries.map { SceneFrame.wire(it) })
            .containsExactly("fade", "zoom", "slide", "reveal").inOrder()
        assertThat(SceneFrame.parseTransition("slide")).isEqualTo(StoryTransitionEffect.SLIDE)
        assertThat(SceneFrame.parseTransition("tourbillon")).isNull()
        assertThat(SceneFrame.parseTransition(null)).isNull()
    }

    @Test
    fun `les transitions rejouees par un choix sont celles de la slide apres le choix`() {
        val frame = SceneFrame(opening = StoryTransitionEffect.FADE)
        assertThat(frame.transitions()).isEqualTo(SceneTransitions(StoryTransitionEffect.FADE, null))
    }
}
