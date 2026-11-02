package me.meeshy.sdk.model.call.camera

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CameraPickerLawTest {
    private fun back(id: String, mm: Float) = CameraLensProbe(id, isFront = false, equivalentFocalMm = mm, maxDigitalZoom = 8f)
    private fun front(id: String) = CameraLensProbe(id, isFront = true, equivalentFocalMm = 25f, maxDigitalZoom = 4f)
    private fun external(id: String) = CameraLensProbe(id, isFront = false, equivalentFocalMm = 0f, isExternal = true)

    @Test
    fun `l'avant, l'arriere principal puis chaque camera externe, jamais chaque objectif`() {
        val options = CameraPickerLaw.options(listOf(back("0", 26f), back("2", 13f), back("3", 77f), front("1"), external("10"), external("11")))
        assertThat(options).containsExactly(
            CameraDeviceOption("1", CameraFacing.Front),
            CameraDeviceOption("0", CameraFacing.Back),
            CameraDeviceOption("10", CameraFacing.External, externalNumber = 1),
            CameraDeviceOption("11", CameraFacing.External, externalNumber = 2),
        ).inOrder()
    }

    @Test
    fun `une seule camera externe ne porte pas de numero`() {
        val options = CameraPickerLaw.options(listOf(front("1"), external("10")))
        assertThat(options.last()).isEqualTo(CameraDeviceOption("10", CameraFacing.External, externalNumber = null))
    }

    @Test
    fun `le choix remplace la bascule seulement avec une camera externe`() {
        assertThat(CameraPickerLaw.hasSelectableCameras(CameraPickerLaw.options(listOf(back("0", 26f), front("1"))))).isFalse()
        assertThat(CameraPickerLaw.hasSelectableCameras(CameraPickerLaw.options(listOf(back("0", 26f), front("1"), external("10"))))).isTrue()
        assertThat(CameraPickerLaw.hasSelectableCameras(CameraPickerLaw.options(listOf(external("10"))))).isFalse()
    }

    @Test
    fun `un objectif arriere ouvert par le zoom coche la camera arriere`() {
        val probes = listOf(back("0", 26f), back("2", 13f), front("1"), external("10"))
        val options = CameraPickerLaw.options(probes)
        assertThat(CameraPickerLaw.selectedId(options, probes, openId = "2")).isEqualTo("0")
        assertThat(CameraPickerLaw.selectedId(options, probes, openId = "10")).isEqualTo("10")
        assertThat(CameraPickerLaw.selectedId(options, probes, openId = "1")).isEqualTo("1")
        assertThat(CameraPickerLaw.selectedId(options, probes, openId = null)).isNull()
    }

    @Test
    fun `une camera externe n'est jamais un objectif de la camera arriere`() {
        val probes = listOf(back("0", 26f), CameraLensProbe("10", isFront = false, equivalentFocalMm = 80f, isExternal = true))
        val profile = requireNotNull(CameraLensClassifier.profile(probes, isFront = false))
        assertThat(profile.lenses.map { it.id }).containsExactly("0")
    }
}
