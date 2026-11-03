package me.meeshy.sdk.model.playback

import me.meeshy.sdk.model.media.DeviceThermalState

/**
 * **La politique thermique des médias** (iOS `MediaThermalPolicy`) : de l'état thermique de l'appareil
 * (`PowerManager.getCurrentThermalStatus`, API 29, plié par `AndroidDeviceSignals.thermalState`) aux leviers
 * de lecture. Plus l'appareil chauffe, moins on décode d'avance et moins on réveille l'interface.
 *
 * Le seuil de chaleur n'est pas décidé ici : [DeviceThermalState.throttles] le tient, comme pour le tier.
 * Aucun levier n'est illimité : le débit est toujours borné.
 */
public object MediaThermalPolicy {

    private const val TICK_COOL_MS: Long = 200L
    private const val TICK_HOT_MS: Long = 500L
    private const val AHEAD_COOL_MS: Long = 1_000L
    private const val AHEAD_HOT_MS: Long = 500L
    private const val WATCHED_AHEAD_COOL_MS: Long = 2_000L
    private const val WATCHED_AHEAD_HOT_MS: Long = 1_000L

    /** Plafond de débit (bits/s) de la vidéo REGARDÉE à froid. */
    public const val WATCHED_PEAK_BITRATE_BPS: Int = 1_500_000

    private const val WATCHED_PEAK_BITRATE_HOT_BPS: Int = 1_000_000
    private const val PREROLL_PEAK_BITRATE_BPS: Int = 750_000
    private const val PREROLL_PEAK_BITRATE_HOT_BPS: Int = 500_000

    /** Cadence (ms) de l'horloge de lecture : plus lente à chaud, chaque tick réveille la chrome. */
    public fun tickIntervalMs(thermal: DeviceThermalState): Long =
        if (thermal.throttles) TICK_HOT_MS else TICK_COOL_MS

    /** Profondeur de décodage anticipé (ms) d'un élément préchauffé : ~1 s, moitié à chaud. */
    public fun forwardBufferMs(thermal: DeviceThermalState): Long =
        if (thermal.throttles) AHEAD_HOT_MS else AHEAD_COOL_MS

    /** Profondeur anticipée (ms) de l'élément À L'ÉCRAN. */
    public fun watchedForwardBufferMs(thermal: DeviceThermalState): Long =
        if (thermal.throttles) WATCHED_AHEAD_HOT_MS else WATCHED_AHEAD_COOL_MS

    /** Plafond de débit (bits/s) : [isPrerolling] pour un réel voisin, moins gourmand que le réel regardé. */
    public fun peakBitrateBps(thermal: DeviceThermalState, isPrerolling: Boolean): Int = when {
        isPrerolling && thermal.throttles -> PREROLL_PEAK_BITRATE_HOT_BPS
        isPrerolling -> PREROLL_PEAK_BITRATE_BPS
        thermal.throttles -> WATCHED_PEAK_BITRATE_HOT_BPS
        else -> WATCHED_PEAK_BITRATE_BPS
    }

    /** Préchauffer le réel suivant ? Suspendu à chaud critique : le balayage cesse d'ouvrir des décodeurs. */
    public fun shouldPrefetchVideo(thermal: DeviceThermalState): Boolean = thermal != DeviceThermalState.CRITICAL
}
