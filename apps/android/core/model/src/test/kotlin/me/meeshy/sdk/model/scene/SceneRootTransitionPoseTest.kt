package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTransitionEffect
import org.junit.Test

class SceneRootTransitionPoseTest {

    private fun open(effect: StoryTransitionEffect?, t: Double) = SceneRootTransitionPose.opening(effect, t)

    @Test
    fun `fondu a l ouverture monte de 0 a 1 puis redevient neutre`() {
        assertThat(open(StoryTransitionEffect.FADE, 0.0).opacity).isEqualTo(0.0)
        assertThat(open(StoryTransitionEffect.FADE, 0.6).opacity).isWithin(1e-9).of(0.5)
        assertThat(open(StoryTransitionEffect.FADE, 1.2)).isEqualTo(SceneRootPose.NEUTRAL)
    }

    @Test
    fun `zoom a l ouverture deszoome de 1,08 vers 1`() {
        assertThat(open(StoryTransitionEffect.ZOOM, 0.0).scale).isWithin(1e-9).of(1.08)
        assertThat(open(StoryTransitionEffect.ZOOM, 0.6).scale).isWithin(1e-9).of(1.04)
        assertThat(open(StoryTransitionEffect.ZOOM, 1.2).scale).isEqualTo(1.0)
    }

    @Test
    fun `glissement a l ouverture part de plus 8 pour cent de la largeur vers 0`() {
        assertThat(open(StoryTransitionEffect.SLIDE, 0.0).translateXFraction).isWithin(1e-9).of(0.08)
        assertThat(open(StoryTransitionEffect.SLIDE, 0.6).translateXFraction).isWithin(1e-9).of(0.04)
        assertThat(open(StoryTransitionEffect.SLIDE, 1.2).translateXFraction).isEqualTo(0.0)
    }

    @Test
    fun `revelation a l ouverture grandit d un point au recouvrement puis retire le masque`() {
        assertThat(open(StoryTransitionEffect.REVEAL, 0.0).revealCoverage).isEqualTo(0.0)
        assertThat(open(StoryTransitionEffect.REVEAL, 0.6).revealCoverage).isWithin(1e-9).of(0.5)
        assertThat(open(StoryTransitionEffect.REVEAL, 1.2).revealCoverage).isNull()
    }

    @Test
    fun `effet absent ou inconnu ne produit aucune transition`() {
        assertThat(open(null, 0.3)).isEqualTo(SceneRootPose.NEUTRAL)
        assertThat(SceneRootTransitionPose.closing(null, 5.0, 4.9)).isEqualTo(SceneRootPose.NEUTRAL)
    }

    @Test
    fun `la fermeture est neutre avant la fenetre puis suit la tete de lecture`() {
        val total = 5.0
        assertThat(SceneRootTransitionPose.closing(StoryTransitionEffect.FADE, total, 3.8)).isEqualTo(SceneRootPose.NEUTRAL)
        assertThat(SceneRootTransitionPose.closing(StoryTransitionEffect.FADE, total, 4.4).opacity).isWithin(1e-9).of(0.5)
        assertThat(SceneRootTransitionPose.closing(StoryTransitionEffect.FADE, total, 5.0).opacity).isWithin(1e-9).of(0.0)
        assertThat(SceneRootTransitionPose.closing(StoryTransitionEffect.ZOOM, total, 5.0).scale).isWithin(1e-9).of(1.08)
        assertThat(SceneRootTransitionPose.closing(StoryTransitionEffect.SLIDE, total, 5.0).translateXFraction).isWithin(1e-9).of(-0.08)
        assertThat(SceneRootTransitionPose.closing(StoryTransitionEffect.REVEAL, total, 4.4).revealCoverage).isWithin(1e-9).of(0.5)
    }

    @Test
    fun `duree totale invalide ne ferme rien`() {
        assertThat(SceneRootTransitionPose.closingProgress(0.0, 1.0)).isEqualTo(0.0)
        assertThat(SceneRootTransitionPose.closingProgress(Double.NaN, 1.0)).isEqualTo(0.0)
    }

    @Test
    fun `la fermeture prend la main sur l ouverture quand les fenetres se chevauchent`() {
        val pose = SceneRootTransitionPose.at(StoryTransitionEffect.FADE, StoryTransitionEffect.ZOOM, 2.0, 1.4)
        assertThat(pose.scale).isGreaterThan(1.0)
        val entering = SceneRootTransitionPose.at(StoryTransitionEffect.FADE, StoryTransitionEffect.ZOOM, 2.0, 0.3)
        assertThat(entering.opacity).isWithin(1e-9).of(0.25)
    }

    @Test
    fun `rayon de revelation vaut un point a zero et la demi diagonale a un`() {
        assertThat(SceneRootTransitionPose.revealRadius(0.0, 300.0, 400.0)).isEqualTo(1.0)
        assertThat(SceneRootTransitionPose.revealRadius(1.0, 300.0, 400.0)).isWithin(1e-9).of(250.0)
    }
}
