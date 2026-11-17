package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K29 — l'avatar qui voyage : il transporte, il ne dessine rien ; sans portée, fondu sur place. */
class MeeshyAvatarMorphTest {

    @Test
    fun `quatre tailles de voyage`() {
        assertThat(MeeshyAvatarMorphRecipe.BAR).isEqualTo(36)
        assertThat(MeeshyAvatarMorphRecipe.ROW).isEqualTo(44)
        assertThat(MeeshyAvatarMorphRecipe.PIN).isEqualTo(56)
        assertThat(MeeshyAvatarMorphRecipe.HERO).isEqualTo(112)
    }

    @Test
    fun `sans portee ou en mouvement reduit - fondu enchaine`() {
        assertThat(MeeshyAvatarMorphRecipe.resolve(from = 44, to = 112, hasScope = false, canTravel = true).mode)
            .isEqualTo(MeeshyAvatarMorphMode.Crossfade)
        assertThat(MeeshyAvatarMorphRecipe.resolve(from = 44, to = 112, hasScope = true, canTravel = true, reduceMotion = true).mode)
            .isEqualTo(MeeshyAvatarMorphMode.Crossfade)
        assertThat(MeeshyAvatarMorphRecipe.resolve(from = 44, to = 112, hasScope = true, canTravel = false).mode)
            .isEqualTo(MeeshyAvatarMorphMode.Crossfade)
    }

    @Test
    fun `avec portee et capacite - partage - avec progression - pilote au doigt`() {
        assertThat(MeeshyAvatarMorphRecipe.resolve(from = 44, to = 112, hasScope = true, canTravel = true).mode).isEqualTo(MeeshyAvatarMorphMode.Shared)
        val driven = MeeshyAvatarMorphRecipe.resolve(from = 44, to = 112, hasScope = true, progress = 0.4f)
        assertThat(driven.mode).isEqualTo(MeeshyAvatarMorphMode.Driven)
        assertThat(driven.progress).isEqualTo(0.4f)
        assertThat(MeeshyAvatarMorphRecipe.resolve(from = 44, to = 112, hasScope = true, progress = 3f).progress).isEqualTo(1f)
        assertThat(MeeshyAvatarMorphRecipe.resolve(from = 44, to = 112, hasScope = true, progress = Float.NaN).progress).isNull()
    }

    @Test
    fun `560 ms et l echelle se mesure contre le plus grand des deux`() {
        val v = MeeshyAvatarMorphRecipe.resolve(from = 44, to = 112, hasScope = true, canTravel = true)
        assertThat(v.durationMillis).isEqualTo(560)
        assertThat(v.scaleFrom).isWithin(1e-5f).of(44f / 112f)
        assertThat(v.scaleTo).isEqualTo(1f)
    }

    @Test
    fun `le chemin est un arc quand le deplacement depasse la moitie du plus grand diametre sur les deux axes`() {
        fun path(x: Float, y: Float) = MeeshyAvatarMorphRecipe.resolve(from = 44, to = 112, hasScope = true, canTravel = true, displacementX = x, displacementY = y).path
        assertThat(path(200f, 20f)).isEqualTo(MeeshyAvatarMorphPath.Straight)
        assertThat(path(200f, 90f)).isEqualTo(MeeshyAvatarMorphPath.Arc)
        assertThat(MeeshyAvatarMorphRecipe.resolve(from = 44, to = 112, hasScope = true, canTravel = true).path).isEqualTo(MeeshyAvatarMorphPath.Straight)
        assertThat(
            MeeshyAvatarMorphRecipe.resolve(from = 44, to = 112, hasScope = true, canTravel = true, requestedPath = MeeshyAvatarMorphPath.Arc).path,
        ).isEqualTo(MeeshyAvatarMorphPath.Arc)
    }

    @Test
    fun `l anneau et la pastille ne voyagent que si l hote le dit`() {
        val v = MeeshyAvatarMorphRecipe.resolve(from = 44, to = 112, hasScope = true, canTravel = true, ringTravels = true)
        assertThat(v.ringInFlight).isTrue()
        assertThat(v.badgeInFlight).isFalse()
        assertThat(v.badgeLeadMillis).isEqualTo(80)
        assertThat(v.badgeReturnMillis).isEqualTo(120)
    }

    @Test
    fun `les bijoux - anneau a 4,5 pour cent (2 au moins), pastille a 25 pour cent (14 au moins)`() {
        val hero = MeeshyAvatarMorphRecipe.jewels(112f)
        assertThat(hero.ringGapDp).isWithin(0.01f).of(5.04f)
        assertThat(hero.badgeDp).isEqualTo(28f)
        val bar = MeeshyAvatarMorphRecipe.jewels(36f)
        assertThat(bar.ringGapDp).isEqualTo(2f)
        assertThat(bar.badgeDp).isEqualTo(14f)
    }
}
