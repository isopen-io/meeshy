package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SceneContentReadinessTest {

    private fun readiness(slide: String, kind: SceneReadinessKind, foregroundPending: Boolean = false) =
        SceneContentReadiness().also { it.begin(slide, kind, foregroundPending) }

    @Test
    fun `un aplat est prêt dès son signal`() {
        val readiness = readiness("a", SceneReadinessKind.Flat)
        assertThat(readiness.onBackgroundReady("a")).isTrue()
    }

    @Test
    fun `le signal n'est émis qu'une fois par slide`() {
        val readiness = readiness("a", SceneReadinessKind.Image)
        assertThat(readiness.onBackgroundReady("a")).isTrue()
        assertThat(readiness.onBackgroundReady("a")).isFalse()
        assertThat(readiness.onBackgroundFailsafe("a")).isFalse()
    }

    @Test
    fun `un signal d'une slide de prélecture est ignoré`() {
        val readiness = readiness("a", SceneReadinessKind.Video)
        assertThat(readiness.onBackgroundReady("b")).isFalse()
        assertThat(readiness.onBackgroundReady("a")).isTrue()
    }

    @Test
    fun `une nouvelle slide rouvre le signal`() {
        val readiness = readiness("a", SceneReadinessKind.Image)
        readiness.onBackgroundReady("a")
        readiness.begin("b", SceneReadinessKind.Image)
        assertThat(readiness.onBackgroundReady("a")).isFalse()
        assertThat(readiness.onBackgroundReady("b")).isTrue()
    }

    @Test
    fun `un aplat attend ses vidéos de premier plan`() {
        val readiness = readiness("a", SceneReadinessKind.Flat, foregroundPending = true)
        assertThat(readiness.onBackgroundReady("a")).isFalse()
        assertThat(readiness.onForegroundReady("a")).isTrue()
    }

    @Test
    fun `le garde-fou du premier plan libère un aplat`() {
        val readiness = readiness("a", SceneReadinessKind.Flat, foregroundPending = true)
        readiness.onBackgroundReady("a")
        assertThat(readiness.onForegroundTimedOut("a")).isTrue()
    }

    @Test
    fun `un clip de premier plan lent ne retient jamais un fond image ou vidéo`() {
        assertThat(readiness("a", SceneReadinessKind.Image, foregroundPending = true).onBackgroundReady("a")).isTrue()
        assertThat(readiness("b", SceneReadinessKind.Video, foregroundPending = true).onBackgroundReady("b")).isTrue()
    }

    @Test
    fun `le premier plan prêt ne suffit pas sans le fond`() {
        val readiness = readiness("a", SceneReadinessKind.Image)
        assertThat(readiness.onForegroundReady("a")).isFalse()
        assertThat(readiness.onBackgroundReady("a")).isTrue()
    }

    @Test
    fun `le garde-fou du fond ouvre le départ d'une image jamais livrée`() {
        val readiness = readiness("a", SceneReadinessKind.Image)
        assertThat(readiness.onBackgroundFailsafe("a")).isTrue()
    }
}
