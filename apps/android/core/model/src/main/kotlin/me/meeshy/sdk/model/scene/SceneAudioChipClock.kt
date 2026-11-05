package me.meeshy.sdk.model.scene

import java.util.Locale
import me.meeshy.sdk.model.StoryAudioPlayerObject

/**
 * Ce que le chrono d'une puce sonore sait de sa piste : son entrée sur la scène, la longueur d'une passe (`null` : inconnue)
 * et sa boucle déclarée.
 */
public data class SceneAudioChipTiming(
    val startTime: Double = 0.0,
    val passSeconds: Double? = null,
    val loop: Boolean? = null,
    val isBackground: Boolean = false,
) {
    /** La position, en secondes, que la puce affiche à [slideElapsed] ; [isEditPreview] : au compositeur, chaque son boucle. */
    public fun positionSeconds(slideElapsed: Double, isEditPreview: Boolean = false): Double {
        val elapsed = slideElapsed - startTime
        if (!elapsed.isFinite() || elapsed <= 0.0) return 0.0
        if (SceneAudioLoopLaw.loops(loop, isBackground, isEditPreview)) return SceneAudioLoopLaw.elapsedInPass(elapsed, passSeconds ?: 0.0)
        return passSeconds?.let { minOf(elapsed, it) } ?: elapsed
    }
}

/**
 * Le chrono de la puce d'un son posé sur la scène (#16293, jumelle iOS #16294) : la position dans la passe qui sonne,
 * revenue à zéro à chaque tour quand le son boucle — la même loi que le mixeur ([SceneAudioLoopLaw]), lue sur l'écoulé
 * de la slide. Le compositeur et le lecteur la lisent tous deux (loi 6 : le player est l'aperçu).
 */
public object SceneAudioChipClock {

    public fun timing(audio: StoryAudioPlayerObject): SceneAudioChipTiming = SceneAudioChipTiming(
        startTime = (audio.startTime ?: 0f).toDouble().takeIf { it.isFinite() }?.coerceAtLeast(0.0) ?: 0.0,
        passSeconds = passSeconds(audio),
        loop = audio.loop,
        isBackground = audio.isBackground == true,
    )

    /** Une passe : la fenêtre de rognage de la source, sinon la durée que le son occupe ; `null` quand rien ne la dit. */
    public fun passSeconds(audio: StoryAudioPlayerObject): Double? {
        val end = audio.sourceEnd?.toDouble()?.takeIf { it.isFinite() && it > 0.0 }
        val start = audio.sourceStart?.toDouble()?.takeIf { it.isFinite() && it > 0.0 } ?: 0.0
        val window = end?.let { it - start }?.takeIf { it > 0.0 }
        return window ?: audio.duration?.toDouble()?.takeIf { it.isFinite() && it > 0.0 }
    }

    public fun positionSeconds(audio: StoryAudioPlayerObject, slideElapsed: Double, isEditPreview: Boolean = false): Double =
        timing(audio).positionSeconds(slideElapsed, isEditPreview)

    /** La position d'un lecteur vivant tenu sur la source entière, ramenée au début de sa fenêtre. */
    public fun livePositionSeconds(currentMs: Long, windowStartMs: Long): Double =
        (currentMs - windowStartMs).coerceAtLeast(0L) / MS

    /** « M:SS », secondes tronquées : le chiffre ne devance jamais le son. */
    public fun label(seconds: Double): String {
        val whole = if (seconds.isFinite() && seconds > 0.0) seconds.toLong() else 0L
        return String.format(Locale.ROOT, "%d:%02d", whole / SECONDS_PER_MINUTE, whole % SECONDS_PER_MINUTE)
    }

    private const val SECONDS_PER_MINUTE = 60L
    private const val MS = 1000.0
}
