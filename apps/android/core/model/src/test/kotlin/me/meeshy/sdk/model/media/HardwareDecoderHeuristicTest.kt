package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Un décodeur compte pour la loi du tier seulement s'il est MATÉRIEL : un
 * décodeur logiciel HEVC ou AV1 existe sur tout Android et ne dit rien de la
 * puissance de l'appareil.
 */
class HardwareDecoderHeuristicTest {

    @Test
    fun `depuis Android 10 le systeme tranche et le nom est ignore`() {
        assertThat(
            HardwareDecoderHeuristic.isHardware(
                name = "c2.android.hevc.decoder",
                hardwareAccelerated = true,
                softwareOnly = false,
            ),
        ).isTrue()
        assertThat(
            HardwareDecoderHeuristic.isHardware(
                name = "c2.qti.hevc.decoder",
                hardwareAccelerated = false,
                softwareOnly = true,
            ),
        ).isFalse()
    }

    @Test
    fun `un decodeur declare logiciel n est jamais materiel meme accelere`() {
        assertThat(
            HardwareDecoderHeuristic.isHardware(
                name = "c2.vendor.av1.decoder",
                hardwareAccelerated = true,
                softwareOnly = true,
            ),
        ).isFalse()
    }

    @Test
    fun `avant Android 10 les decodeurs de reference sont logiciels`() {
        listOf(
            "OMX.google.hevc.decoder",
            "c2.android.hevc.decoder",
            "c2.google.av1.decoder",
            "OMX.ffmpeg.hevc.decoder",
        ).forEach { name ->
            assertThat(HardwareDecoderHeuristic.isHardware(name, hardwareAccelerated = null, softwareOnly = null))
                .isFalse()
        }
    }

    @Test
    fun `avant Android 10 les decodeurs logiciels d un constructeur sont reconnus`() {
        listOf(
            "OMX.SEC.hevc.sw.dec",
            "c2.sec.hevc.sw.decoder",
        ).forEach { name ->
            assertThat(HardwareDecoderHeuristic.isHardware(name, hardwareAccelerated = null, softwareOnly = null))
                .isFalse()
        }
    }

    @Test
    fun `avant Android 10 un decodeur de constructeur est materiel`() {
        listOf(
            "OMX.qcom.video.decoder.hevc",
            "c2.qti.hevc.decoder",
            "OMX.MTK.VIDEO.DECODER.HEVC",
            "c2.exynos.hevc.decoder",
            "OMX.Exynos.HEVC.Decoder",
        ).forEach { name ->
            assertThat(HardwareDecoderHeuristic.isHardware(name, hardwareAccelerated = null, softwareOnly = null))
                .isTrue()
        }
    }

    @Test
    fun `le nom se compare sans tenir compte de la casse`() {
        assertThat(
            HardwareDecoderHeuristic.isHardware("OMX.GOOGLE.HEVC.DECODER", hardwareAccelerated = null, softwareOnly = null),
        ).isFalse()
    }
}
