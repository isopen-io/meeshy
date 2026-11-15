package me.meeshy.sdk.media

import android.app.ActivityManager
import android.content.Context
import android.hardware.display.DisplayManager
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.os.Build
import android.os.PowerManager
import android.view.Display
import me.meeshy.sdk.model.media.DeviceMediaInputs
import me.meeshy.sdk.model.media.DeviceMediaSignals
import me.meeshy.sdk.model.media.DeviceMediaTier
import me.meeshy.sdk.model.media.DeviceThermalState
import me.meeshy.sdk.model.media.HardwareDecoderHeuristic

/**
 * Le tier média de CET appareil, maintenant — l'analogue Android de
 * `DeviceMediaTier.current` d'iOS. Les lois de lecture (préchargement, qualité,
 * pool de lecteurs) lisent ce rang au lieu de réinventer chacune son seuil.
 */
public interface DeviceMediaTierSource {
    public fun current(): DeviceMediaTier
}

/**
 * **La sonde de l'appareil vivant** — la seule moitié de [DeviceMediaTier] qui
 * touche le système ; la loi qui range ses mesures est PURE (`DeviceMediaTier.classify`,
 * `:core:model`).
 *
 * Le matériel (mémoire, cœurs, cadence, décodeurs) est lu UNE fois puis gardé :
 * un appel depuis une liste qui défile ne rejoue ni `MediaCodecList` ni
 * `DisplayManager`. L'économie d'énergie et l'état thermique sont relus à CHAQUE
 * lecture (deux lectures de service système, sans énumération) : un téléphone qui
 * chauffe descend en `LOW` sans relancer l'app, et y remonte en refroidissant.
 *
 * La première lecture du matériel énumère les décodeurs, ce qui coûte quelques
 * dizaines de millisecondes : un appelant sur le fil principal au démarrage
 * l'amorce d'abord depuis un fil de fond avec [warmUp].
 */
public class DeviceMediaProbe(
    private val readHardware: () -> DeviceMediaSignals,
    private val readLowPower: () -> Boolean,
    private val readThermal: () -> DeviceThermalState,
) : DeviceMediaTierSource {

    private val hardware: DeviceMediaSignals by lazy(LazyThreadSafetyMode.SYNCHRONIZED, readHardware)

    /** Le matériel, lu une seule fois pour la vie du processus. */
    public fun warmUp(): DeviceMediaSignals = hardware

    /** Les entrées NEUTRES de la loi, avec l'énergie et la chaleur du moment. */
    public fun inputs(): DeviceMediaInputs =
        hardware.inputs(lowPower = readLowPower(), thermal = readThermal())

    override fun current(): DeviceMediaTier = DeviceMediaTier.classify(inputs())

    public companion object {
        public fun forContext(context: Context): DeviceMediaProbe {
            val application = context.applicationContext
            return DeviceMediaProbe(
                readHardware = { AndroidDeviceSignals.hardware(application) },
                readLowPower = {
                    AndroidDeviceSignals.lowPower(application.getSystemService(PowerManager::class.java))
                },
                readThermal = {
                    AndroidDeviceSignals.thermal(application.getSystemService(PowerManager::class.java))
                },
            )
        }
    }
}

/** Ce que `ActivityManager` rapporte de la mémoire, avant que la loi le normalise. */
internal data class MemoryReading(
    val totalMemBytes: Long,
    val memoryClassMb: Int,
    val isLowRamDevice: Boolean,
)

/**
 * Les lectures du système, une par entrée de la loi. Chacune est une projection
 * mince : la décision (plafonds de mémoire, arrondi de cadence, décodeur matériel
 * ou non) vit dans `:core:model`.
 */
internal object AndroidDeviceSignals {

    private const val HEVC_MIME = "video/hevc"

    // MediaFormat.MIMETYPE_VIDEO_AV1 n'existe qu'à partir de l'API 29.
    private const val AV1_MIME = "video/av01"

    fun hardware(context: Context): DeviceMediaSignals {
        val memory = memory(context.getSystemService(ActivityManager::class.java))
        val hardwareDecoders = hardwareDecoderMimeTypes()
        return DeviceMediaSignals(
            memoryGb = DeviceMediaSignals.memoryGb(
                totalMemBytes = memory.totalMemBytes,
                memoryClassMb = memory.memoryClassMb,
                isLowRamDevice = memory.isLowRamDevice,
            ),
            cores = Runtime.getRuntime().availableProcessors(),
            maxFps = maxFramesPerSecond(context.getSystemService(DisplayManager::class.java)),
            hwHevc = HEVC_MIME in hardwareDecoders,
            hwAv1 = AV1_MIME in hardwareDecoders,
        )
    }

    fun memory(activityManager: ActivityManager?): MemoryReading {
        if (activityManager == null) return MemoryReading(totalMemBytes = 0, memoryClassMb = 0, isLowRamDevice = false)
        val info = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(info)
        return MemoryReading(
            totalMemBytes = info.totalMem,
            memoryClassMb = activityManager.memoryClass,
            isLowRamDevice = activityManager.isLowRamDevice,
        )
    }

    fun lowPower(powerManager: PowerManager?): Boolean = powerManager?.isPowerSaveMode ?: false

    /** Avant Android 10 le système n'expose aucun état thermique : `NOMINAL`, qui ne baisse rien. */
    fun thermal(powerManager: PowerManager?): DeviceThermalState {
        if (powerManager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return DeviceThermalState.NOMINAL
        return thermalState(powerManager.currentThermalStatus)
    }

    /**
     * Les sept crans d'Android sur les quatre de la loi : un bridage léger ou
     * modéré ne change rien (`FAIR`), un bridage sévère range en bas (`SERIOUS`),
     * et tout ce qui est au-delà (critique, urgence, extinction) est `CRITICAL`.
     */
    fun thermalState(status: Int): DeviceThermalState = when {
        status >= PowerManager.THERMAL_STATUS_CRITICAL -> DeviceThermalState.CRITICAL
        status == PowerManager.THERMAL_STATUS_SEVERE -> DeviceThermalState.SERIOUS
        status >= PowerManager.THERMAL_STATUS_LIGHT -> DeviceThermalState.FAIR
        else -> DeviceThermalState.NOMINAL
    }

    /**
     * La cadence MAXIMALE de l'écran, pas celle du mode courant : un écran 120 Hz
     * adaptatif se pose volontiers à 60 Hz au repos. Une énumération d'écran qui
     * échoue sur un constructeur tient lieu de 60 Hz.
     */
    fun maxFramesPerSecond(displayManager: DisplayManager?): Int = runCatching {
        val display = displayManager?.getDisplay(Display.DEFAULT_DISPLAY)
            ?: return@runCatching DeviceMediaSignals.DEFAULT_FRAMES_PER_SECOND
        val rates = display.supportedModes.map { it.refreshRate } + display.refreshRate
        DeviceMediaSignals.framesPerSecond(rates.max())
    }.getOrDefault(DeviceMediaSignals.DEFAULT_FRAMES_PER_SECOND)

    /**
     * Les types MIME (en minuscules) que l'appareil décode en MATÉRIEL, en UNE
     * énumération de `MediaCodecList`. Une énumération qui échoue sur un
     * constructeur n'annonce aucun décodeur : la loi range alors l'appareil en bas.
     */
    fun hardwareDecoderMimeTypes(): Set<String> = runCatching {
        MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos
            .filter { !it.isEncoder && isHardwareDecoder(it) }
            .flatMap { it.supportedTypes.asList() }
            .map { it.lowercase() }
            .toSet()
    }.getOrDefault(emptySet())

    private fun isHardwareDecoder(info: MediaCodecInfo): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            HardwareDecoderHeuristic.isHardware(info.name, info.isHardwareAccelerated, info.isSoftwareOnly)
        } else {
            HardwareDecoderHeuristic.isHardware(info.name, hardwareAccelerated = null, softwareOnly = null)
        }
}
