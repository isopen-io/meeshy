package me.meeshy.sdk.model.call.camera

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import org.junit.Test

class CameraZoomProfileTest {
    private val triple = listOf(CameraLens("w", 0.5f), CameraLens("m", 1f), CameraLens("t", 3f))
    private fun profile(lenses: List<CameraLens> = triple, front: Boolean = false, digital: Float = 10f) =
        requireNotNull(CameraZoomPolicy.profile(lenses, front, digital))

    @Test
    fun `les pastilles d'un triple objectif sont 0,5 1 2 3`() {
        assertThat(profile().quickStops).containsExactly(0.5f, 1f, 2f, 3f).inOrder()
    }

    @Test
    fun `un appareil a un seul objectif offre 1 et 2 comme la camera avant`() {
        assertThat(profile(listOf(CameraLens("m", 1f))).quickStops).containsExactly(1f, 2f).inOrder()
        assertThat(profile(listOf(CameraLens("f", 1f)), front = true, digital = 8f).quickStops).containsExactly(1f, 2f).inOrder()
    }

    @Test
    fun `un capteur qui ne zoome pas n'offre aucun profil`() {
        assertThat(CameraZoomPolicy.profile(listOf(CameraLens("m", 1f)), isFront = true, maxDigitalZoom = 1f)).isNull()
        assertThat(CameraZoomPolicy.profile(emptyList(), isFront = false, maxDigitalZoom = 8f)).isNull()
    }

    @Test
    fun `un zoom numerique sous deux ne propose pas 2x`() {
        assertThat(profile(listOf(CameraLens("m", 1f)), digital = 1.5f).quickStops).containsExactly(1f)
    }

    @Test
    fun `la camera avant plafonne a 3x, l'arriere a 10x`() {
        assertThat(profile(listOf(CameraLens("f", 1f)), front = true, digital = 8f).maxDisplay).isEqualTo(3f)
        assertThat(profile(listOf(CameraLens("m", 1f)), digital = 30f).maxDisplay).isEqualTo(10f)
    }

    @Test
    fun `le facteur suivant passe de 1 a 2, boucle au plus large, saute entre deux crans`() {
        val p = profile()
        assertThat(p.nextQuickStop(1f)).isEqualTo(2f)
        assertThat(p.nextQuickStop(3f)).isEqualTo(0.5f)
        assertThat(p.nextQuickStop(2.4f)).isEqualTo(3f)
    }

    @Test
    fun `le pincement multiplie le facteur du debut du geste dans les bornes`() {
        val p = profile(listOf(CameraLens("f", 1f)), front = true, digital = 8f)
        assertThat(p.display(pinchScale = 2f, from = 1f)).isEqualTo(2f)
        assertThat(p.display(pinchScale = 9f, from = 1f)).isEqualTo(3f)
        assertThat(p.display(pinchScale = 0f, from = 2f)).isEqualTo(1f)
    }

    @Test
    fun `au relacher un facteur proche d'un objectif s'y aimante, pas ailleurs`() {
        val p = profile()
        assertThat(p.settled(2.9f)).isEqualTo(3f)
        assertThat(p.settled(2.4f)).isEqualTo(2.4f)
    }

    @Test
    fun `le plan choisit l'objectif le plus long qui ne depasse pas puis recadre le reste`() {
        val p = profile()
        assertThat(p.plan(0.5f)).isEqualTo(CameraZoomPlan("w", 1f))
        assertThat(p.plan(1f)).isEqualTo(CameraZoomPlan("m", 1f))
        assertThat(p.plan(2f)).isEqualTo(CameraZoomPlan("m", 2f))
        assertThat(p.plan(3f)).isEqualTo(CameraZoomPlan("t", 1f))
        assertThat(p.plan(5f)).isEqualTo(CameraZoomPlan("t", 5f / 3f))
    }

    @Test
    fun `les crans de TalkBack montent et descendent`() {
        val p = profile()
        assertThat(p.stepped(1f, CameraZoomStep.Increment)).isEqualTo(2f)
        assertThat(p.stepped(1f, CameraZoomStep.Decrement)).isEqualTo(0.5f)
        assertThat(p.stepped(10f, CameraZoomStep.Increment)).isEqualTo(10f)
    }

    @Test
    fun `le libelle porte une decimale au plus dans la langue du lecteur`() {
        assertThat(CameraZoomPolicy.label(0.5f, Locale.FRANCE)).isEqualTo("0,5×")
        assertThat(CameraZoomPolicy.label(2.0f, Locale.US)).isEqualTo("2×")
        assertThat(CameraZoomPolicy.label(2.44f, Locale.US)).isEqualTo("2.4×")
    }

    @Test
    fun `la rampe avance en puissances de deux par seconde sans depasser`() {
        assertThat(CameraZoomPolicy.ramp(1f, 4f, rate = 1f, seconds = 1f)).isWithin(1e-4f).of(2f)
        assertThat(CameraZoomPolicy.ramp(1f, 2f, rate = 4f, seconds = 1f)).isEqualTo(2f)
        assertThat(CameraZoomPolicy.ramp(4f, 1f, rate = 1f, seconds = 1f)).isWithin(1e-4f).of(2f)
        assertThat(CameraZoomPolicy.ramp(2f, 2f, rate = 1f, seconds = 0f)).isEqualTo(2f)
    }
}
