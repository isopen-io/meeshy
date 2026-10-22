package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameMotionLawsTest {

    @Test
    fun `le rebond enfonce a 0,94 sans mouvement reduit`() {
        assertThat(GameBounceSpec.scale(pressed = true, reduceMotion = false)).isEqualTo(0.94f)
        assertThat(GameBounceSpec.scale(pressed = false, reduceMotion = false)).isEqualTo(1f)
    }

    @Test
    fun `sous mouvement reduit le rebond devient un fondu a 0,6`() {
        assertThat(GameBounceSpec.scale(pressed = true, reduceMotion = true)).isEqualTo(1f)
        assertThat(GameBounceSpec.opacity(pressed = true, reduceMotion = true)).isEqualTo(0.6f)
        assertThat(GameBounceSpec.opacity(pressed = true, reduceMotion = false)).isEqualTo(1f)
        assertThat(GameBounceSpec.opacity(pressed = false, reduceMotion = true)).isEqualTo(1f)
    }

    @Test
    fun `le relache est sous-amorti et l'enfoncement amorti`() {
        assertThat(GameBounceSpec.RELEASE_DAMPING).isLessThan(1f)
        assertThat(GameBounceSpec.RELEASE_DAMPING).isLessThan(GameBounceSpec.PRESS_DAMPING)
    }

    @Test
    fun `la duree tombe au fondu sous mouvement reduit`() {
        assertThat(GameChoreographyLaw.effectiveDuration(1.2, reduceMotion = false)).isEqualTo(1.2)
        assertThat(GameChoreographyLaw.effectiveDuration(1.2, reduceMotion = true)).isEqualTo(0.25)
    }

    @Test
    fun `rien ne tourne avant le premier declenchement`() {
        assertThat(GameChoreographyLaw.elapsed(null, 5_000, 1.2, false)).isNull()
        assertThat(GameChoreographyLaw.isRunning(null, 5_000, 1.2, false)).isFalse()
    }

    @Test
    fun `le temps ecoule est borne a la duree et l'horloge s'arrete a la fin`() {
        assertThat(GameChoreographyLaw.elapsed(1_000, 1_450, 1.2, false)).isWithin(1e-9).of(0.45)
        assertThat(GameChoreographyLaw.elapsed(1_000, 9_000, 1.2, false)).isEqualTo(1.2)
        assertThat(GameChoreographyLaw.elapsed(1_000, 500, 1.2, false)).isEqualTo(0.0)
        assertThat(GameChoreographyLaw.isRunning(1_000, 2_100, 1.2, false)).isTrue()
        assertThat(GameChoreographyLaw.isRunning(1_000, 2_300, 1.2, false)).isFalse()
        assertThat(GameChoreographyLaw.isRunning(1_000, 1_400, 1.2, true)).isFalse()
    }

    @Test
    fun `une brique est visible des qu'un point de sa frame touche la fenetre`() {
        assertThat(GameOnScreenLaw.isVisible(0f, 0f, 10f, 10f, 100f, 100f)).isTrue()
        assertThat(GameOnScreenLaw.isVisible(0f, -50f, 10f, -1f, 100f, 100f)).isFalse()
        assertThat(GameOnScreenLaw.isVisible(0f, 120f, 10f, 150f, 100f, 100f)).isFalse()
        assertThat(GameOnScreenLaw.isVisible(-5f, 90f, 5f, 110f, 100f, 100f)).isTrue()
    }

    @Test
    fun `le facteur de texte reste entre un et un virgule trois`() {
        assertThat(GameTypeScaleLaw.factor(0.8f)).isEqualTo(1f)
        assertThat(GameTypeScaleLaw.factor(1.15f)).isEqualTo(1.15f)
        assertThat(GameTypeScaleLaw.factor(2f)).isEqualTo(1.3f)
    }
}
