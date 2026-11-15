package me.meeshy.sdk.model.media

import kotlin.math.roundToInt
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** L'état thermique d'un appareil, dans les quatre crans que la loi du tier distingue. */
@Serializable
public enum class DeviceThermalState {
    @SerialName("nominal")
    NOMINAL,

    @SerialName("fair")
    FAIR,

    @SerialName("serious")
    SERIOUS,

    @SerialName("critical")
    CRITICAL,
    ;

    /** À partir de `serious` le système bride déjà l'appareil : la loi le range en bas. */
    public val throttles: Boolean get() = this == SERIOUS || this == CRITICAL
}

/**
 * **Les entrées NEUTRES du tier média** — ce que toute plateforme sait dire
 * d'elle-même, et rien d'autre. Android les PRODUIT depuis `ActivityManager`,
 * `Runtime`, `Display`, `MediaCodecList` et `PowerManager` (`DeviceMediaProbe`) ;
 * iOS depuis `utsname`, `ProcessInfo`, l'écran et VideoToolbox ; le web depuis
 * `navigator.deviceMemory`, `hardwareConcurrency` et `MediaCapabilities`.
 *
 * Les noms de champs du fil sont ceux de
 * `packages/shared/fixtures/device-tier-vectors.json`, à l'identique.
 */
@Serializable
public data class DeviceMediaInputs(
    /** Mémoire RAPPORTÉE, en Gio ; `null` = inconnue, ne baisse rien. */
    @SerialName("memoryGB") val memoryGb: Double?,
    /** Cœurs logiques actifs ; `null` = inconnu, ne baisse rien. */
    val cores: Int?,
    val maxFps: Int,
    @SerialName("hwAV1") val hwAv1: Boolean,
    @SerialName("hwHEVC") val hwHevc: Boolean,
    val lowPower: Boolean,
    val thermal: DeviceThermalState,
)

/**
 * Ce qu'un appareil déclare de son MATÉRIEL, avant normalisation : la sonde le lit
 * une fois et le garde, [inputs] le rend NEUTRE pour la loi avec l'état d'énergie
 * et de chaleur du moment — les deux seules entrées qui changent pendant la vie
 * du processus.
 */
public data class DeviceMediaSignals(
    val memoryGb: Double?,
    val cores: Int?,
    val maxFps: Int,
    val hwHevc: Boolean,
    val hwAv1: Boolean,
) {
    /** Un compte de cœurs nul n'est pas une mesure : inconnu. */
    public fun inputs(lowPower: Boolean, thermal: DeviceThermalState): DeviceMediaInputs =
        DeviceMediaInputs(
            memoryGb = memoryGb,
            cores = cores?.takeIf { it > 0 },
            maxFps = maxFps,
            hwAv1 = hwAv1,
            hwHevc = hwHevc,
            lowPower = lowPower,
            thermal = thermal,
        )

    public companion object {
        /**
         * Plafond d'un appareil que le système lui-même déclare à mémoire comptée :
         * sous le palier [DeviceMediaTier.MID_MEMORY_GB], donc `LOW` quoi que
         * rapporte `totalMem`.
         */
        public const val LOW_RAM_CEILING_GB: Double = 2.0

        /** Sous ce tas applicatif (Mo), l'appareil est à mémoire comptée, `isLowRamDevice` ou non. */
        public const val LOW_HEAP_CLASS_MB: Int = 96

        public const val DEFAULT_FRAMES_PER_SECOND: Int = 60

        private const val BYTES_PER_GIB: Double = 1_073_741_824.0

        /**
         * `ActivityManager.MemoryInfo.totalMem` en gibioctets binaires — ce que le web
         * reçoit de `navigator.deviceMemory` et iOS de `ProcessInfo.physicalMemory` —,
         * plafonné quand le système déclare lui-même l'appareil à mémoire comptée
         * (`isLowRamDevice`, ou tas applicatif `memoryClass` minuscule). Une mémoire
         * totale illisible est inconnue (`null`) et ne baisse rien, sauf si le système
         * a déjà dit que l'appareil est à mémoire comptée.
         */
        public fun memoryGb(totalMemBytes: Long, memoryClassMb: Int, isLowRamDevice: Boolean): Double? {
            val reported = totalMemBytes.takeIf { it > 0 }?.let { it / BYTES_PER_GIB }
            val memoryStarved = isLowRamDevice || memoryClassMb in 1 until LOW_HEAP_CLASS_MB
            if (!memoryStarved) return reported
            return reported?.let { minOf(it, LOW_RAM_CEILING_GB) } ?: LOW_RAM_CEILING_GB
        }

        /** Une fréquence d'écran (`Display.Mode.getRefreshRate`) en images par seconde entières : 119,88 Hz est du 120 Hz. */
        public fun framesPerSecond(refreshRate: Float): Int =
            if (refreshRate.isFinite() && refreshRate > 0f) refreshRate.roundToInt() else DEFAULT_FRAMES_PER_SECOND
    }
}
