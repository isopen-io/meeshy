package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Le tier média d'un appareil est une loi PURE sur des entrées NEUTRES, rejouée
 * par le web (`apps/web/src/lib/device/capability-tier.ts`), iOS
 * (`DeviceMediaTier.classify`) et Android (`DeviceMediaTier.classify`) sur le
 * MÊME fichier, `packages/shared/fixtures/device-tier-vectors.json`. L'oracle
 * n'est pas écrit à la main : toute dérive d'un client rougit ici plutôt que de
 * se voir sur un appareil.
 */
class DeviceMediaTierVectorsTest {

    @Serializable
    private data class VectorFile(val vectors: List<Vector>)

    @Serializable
    private data class Vector(
        val name: String,
        val input: DeviceMediaInputs,
        @SerialName("tier") val expectedTier: String,
    )

    private val json = Json { ignoreUnknownKeys = true }

    private fun fixture(): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "packages/shared/fixtures/device-tier-vectors.json")
            if (candidate.isFile) return candidate.readText()
            dir = dir.parentFile
        }
        throw AssertionError(
            "Fixture partagée introuvable : packages/shared/fixtures/device-tier-vectors.json " +
                "(remontée depuis ${File(".").absolutePath})",
        )
    }

    private val vectors: List<Vector> = json.decodeFromString(VectorFile.serializer(), fixture()).vectors

    private fun input(
        memoryGb: Double? = 7.5,
        cores: Int? = 6,
        maxFps: Int = 120,
        hwAv1: Boolean = true,
        hwHevc: Boolean = true,
        lowPower: Boolean = false,
        thermal: DeviceThermalState = DeviceThermalState.NOMINAL,
    ) = DeviceMediaInputs(
        memoryGb = memoryGb,
        cores = cores,
        maxFps = maxFps,
        hwAv1 = hwAv1,
        hwHevc = hwHevc,
        lowPower = lowPower,
        thermal = thermal,
    )

    @Test
    fun `le fichier de vecteurs est bien lu en entier`() {
        assertThat(vectors.size).isAtLeast(20)
        assertThat(vectors.map { it.expectedTier }.toSet())
            .containsExactly("low", "mid", "high", "pro")
    }

    @Test
    fun `chaque vecteur partage rend le meme verdict que le web et iOS`() {
        val mismatches = vectors.mapNotNull { vector ->
            val actual = DeviceMediaTier.classify(vector.input)
            val expected = DeviceMediaTier.valueOf(vector.expectedTier.uppercase())
            "${vector.name} : attendu $expected, rendu $actual".takeIf { actual != expected }
        }

        assertThat(mismatches).isEmpty()
    }

    @Test
    fun `les noms de champs du fichier sont ceux du decodeur`() {
        val vector = vectors.first { it.name.startsWith("iPhone 16 Pro") }

        assertThat(vector.input).isEqualTo(
            input(memoryGb = 7.5, cores = 6, maxFps = 120, hwAv1 = true, hwHevc = true),
        )
    }

    @Test
    fun `une memoire ou des coeurs inconnus ne baissent rien`() {
        assertThat(DeviceMediaTier.classify(input(memoryGb = null, cores = null)))
            .isEqualTo(DeviceMediaTier.PRO)
        assertThat(DeviceMediaTier.classify(input(memoryGb = null, cores = null, maxFps = 60)))
            .isEqualTo(DeviceMediaTier.HIGH)
    }

    @Test
    fun `les seuils de memoire sont inclusifs a 2,5 3,5 et 5,5 Gio`() {
        fun tier(memoryGb: Double) = DeviceMediaTier.classify(input(memoryGb = memoryGb))

        assertThat(tier(2.49)).isEqualTo(DeviceMediaTier.LOW)
        assertThat(tier(2.5)).isEqualTo(DeviceMediaTier.MID)
        assertThat(tier(3.49)).isEqualTo(DeviceMediaTier.MID)
        assertThat(tier(3.5)).isEqualTo(DeviceMediaTier.HIGH)
        assertThat(tier(5.49)).isEqualTo(DeviceMediaTier.HIGH)
        assertThat(tier(5.5)).isEqualTo(DeviceMediaTier.PRO)
    }

    @Test
    fun `les seuils de coeurs sont 4 pour haut et 6 pour pro`() {
        fun tier(cores: Int) = DeviceMediaTier.classify(input(cores = cores))

        assertThat(tier(3)).isEqualTo(DeviceMediaTier.MID)
        assertThat(tier(4)).isEqualTo(DeviceMediaTier.HIGH)
        assertThat(tier(5)).isEqualTo(DeviceMediaTier.HIGH)
        assertThat(tier(6)).isEqualTo(DeviceMediaTier.PRO)
    }

    @Test
    fun `pro exige 120 Hz et un decodeur AV1 materiel`() {
        assertThat(DeviceMediaTier.classify(input(maxFps = 119))).isEqualTo(DeviceMediaTier.HIGH)
        assertThat(DeviceMediaTier.classify(input(maxFps = 120))).isEqualTo(DeviceMediaTier.PRO)
        assertThat(DeviceMediaTier.classify(input(hwAv1 = false))).isEqualTo(DeviceMediaTier.HIGH)
    }

    @Test
    fun `sans decodeur HEVC materiel l appareil est bas quel que soit le reste`() {
        assertThat(DeviceMediaTier.classify(input(hwHevc = false))).isEqualTo(DeviceMediaTier.LOW)
    }

    @Test
    fun `l economie d energie plafonne a moyen sans remonter un appareil bas`() {
        assertThat(DeviceMediaTier.classify(input(lowPower = true))).isEqualTo(DeviceMediaTier.MID)
        assertThat(DeviceMediaTier.classify(input(memoryGb = 1.9, lowPower = true)))
            .isEqualTo(DeviceMediaTier.LOW)
    }

    @Test
    fun `les tiers s ordonnent de bas a pro`() {
        assertThat(DeviceMediaTier.entries)
            .containsExactly(
                DeviceMediaTier.LOW,
                DeviceMediaTier.MID,
                DeviceMediaTier.HIGH,
                DeviceMediaTier.PRO,
            ).inOrder()
        assertThat(DeviceMediaTier.LOW < DeviceMediaTier.PRO).isTrue()
    }
}
