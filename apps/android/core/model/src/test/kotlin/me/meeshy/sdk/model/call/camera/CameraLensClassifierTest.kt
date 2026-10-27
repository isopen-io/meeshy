package me.meeshy.sdk.model.call.camera

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CameraLensClassifierTest {
    private fun probe(id: String, mm: Float, front: Boolean = false, digital: Float = 8f) = CameraLensProbe(id, front, mm, digital)

    @Test
    fun `un appareil a un seul capteur arriere ne montre que ses pastilles numeriques`() {
        val profile = requireNotNull(CameraLensClassifier.profile(listOf(probe("0", 27f), probe("1", 25f, front = true)), isFront = false))
        assertThat(profile.lenses).containsExactly(CameraLens("0", 1f))
        assertThat(profile.quickStops).containsExactly(1f, 2f).inOrder()
    }

    @Test
    fun `ultra grand-angle et teleobjectif exposes deviennent 0,5 et 3`() {
        val profile = requireNotNull(
            CameraLensClassifier.profile(listOf(probe("0", 26f), probe("2", 13f), probe("3", 77f), probe("1", 25f, front = true)), isFront = false),
        )
        assertThat(profile.lenses.map { it.ratio }).containsExactly(0.5f, 1f, 3f).inOrder()
        assertThat(profile.plan(0.5f).lensId).isEqualTo("2")
        assertThat(profile.plan(3f).lensId).isEqualTo("3")
    }

    @Test
    fun `un capteur de profondeur ou un doublon n'est pas un objectif`() {
        val profile = requireNotNull(CameraLensClassifier.profile(listOf(probe("0", 26f), probe("4", 24f), probe("5", 32f)), isFront = false))
        assertThat(profile.lenses.map { it.id }).containsExactly("0")
    }

    @Test
    fun `la camera avant n'a jamais qu'un objectif`() {
        val profile = requireNotNull(CameraLensClassifier.profile(listOf(probe("0", 26f), probe("1", 22f, front = true), probe("9", 11f, front = true)), isFront = true))
        assertThat(profile.lenses).containsExactly(CameraLens("1", 1f))
    }

    @Test
    fun `sans camera de la face demandee, aucun profil`() {
        assertThat(CameraLensClassifier.profile(listOf(probe("0", 26f)), isFront = true)).isNull()
    }
}
