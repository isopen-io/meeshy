package me.meeshy.sdk.model.scene

/** L'état de la vidéo PRINCIPALE de la slide, tel que le lecteur le rapporte (Media3 `STATE_*` + `isPlaying`). */
public enum class PrimaryVideoStatus {
    /** `STATE_READY` et en train de jouer. */
    PLAYING,

    /** `STATE_BUFFERING` : le lecteur attend des données. */
    BUFFERING,

    /** Prête mais à l'arrêt, ou idle. */
    PAUSED,
}

/**
 * **Le temps de la story peut-il avancer maintenant ?** — port de iOS `StoryPlaybackHealth.isProgressing`.
 *
 * Pure. La barre et l'avance automatique suivent la lecture RÉELLE : elles se figent quand la vidéo principale
 * bufferise et repartent quand elle rejoue. Un mauvais gel qui bloque une story pour toujours est pire que le
 * défaut qu'il corrige : chaque cas ambigu rend donc `true` (l'horloge murale court).
 *
 * Gardes anti-blocage, chacune force `true` : aucune vidéo principale (`status == null` : image, aplat, audio seul),
 * pause de l'utilisateur (traitée ailleurs, jamais un blocage), lecteur en échec (il ne reviendra pas), garde-fou
 * dépassé ([StoryStallWatchdog], 5 s).
 */
public object StoryPlaybackHealth {

    public fun isProgressing(
        status: PrimaryVideoStatus?,
        isUserPaused: Boolean,
        isFailed: Boolean,
        watchdogExpired: Boolean,
        isAudioPending: Boolean = false,
        isPrimaryMediaPending: Boolean = false,
    ): Boolean {
        if (isUserPaused || isFailed || watchdogExpired) return true
        if (isAudioPending || isPrimaryMediaPending) return false
        return when (status) {
            null, PrimaryVideoStatus.PLAYING -> true
            PrimaryVideoStatus.BUFFERING, PrimaryVideoStatus.PAUSED -> false
        }
    }
}

/**
 * Le garde-fou d'une attente : une attente continue qui dépasse [windowMs] rend la main à l'horloge murale, pour
 * qu'un flux définitivement bloqué (ou un son jamais planifié) ne fige pas la story. Une reprise remet le compteur à zéro.
 */
public class StoryStallWatchdog(private val windowMs: Long = DEFAULT_WINDOW_MS) {
    private var stalledMs: Long = 0

    /** Vrai tant que l'attente est continue depuis plus que la fenêtre. */
    public var expired: Boolean = false
        private set

    public fun tick(stalled: Boolean, deltaMs: Long): Boolean {
        if (!stalled) {
            stalledMs = 0
            expired = false
            return false
        }
        stalledMs += deltaMs.coerceAtLeast(0)
        if (stalledMs >= windowMs) expired = true
        return expired
    }

    public fun reset() {
        stalledMs = 0
        expired = false
    }

    public companion object {
        public const val DEFAULT_WINDOW_MS: Long = 5_000
    }
}
