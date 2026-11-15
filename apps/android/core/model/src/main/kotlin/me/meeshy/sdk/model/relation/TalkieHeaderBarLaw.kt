package me.meeshy.sdk.model.relation

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** La voix qui occupe l'en-tête d'un direct (#17315, iso `TalkieHeaderVoice`) : la mienne qui part, celle du pair, ou aucune. */
public enum class TalkieHeaderVoice {
    NONE,
    OUTGOING,
    INCOMING,
    ;

    public companion object {
        /**
         * La voix qui part l'emporte : on ne parle pas par-dessus sans le voir. Un doigt posé dont la voix n'est pas encore
         * partie laisse l'en-tête au repos — un simple toucher ne fait pas clignoter la barre.
         */
        public fun resolve(look: TalkieHoldLook, peerSpeaking: Boolean): TalkieHeaderVoice = when {
            look == TalkieHoldLook.LIVE -> OUTGOING
            peerSpeaking -> INCOMING
            else -> NONE
        }
    }
}

/** Ce que la voix devient pendant qu'on parle (#17339, iso `TalkieHeaderDelivery`) — visible AVANT la fin. */
public enum class TalkieHeaderDelivery {
    /** L'autre écoute en ce moment : l'onde montre ce qui se dit, sur place. */
    LIVE,

    /** L'autre est hors ligne : la passerelle le réveille et lui rejouera la voix. */
    RELAYED,

    /** Le talkie n'a pas pu passer : la voix s'enregistre et partira en message vocal. */
    RECORDED,
    ;

    public val isRealtime: Boolean get() = this == LIVE

    public companion object {
        /** Une voix qui arrive s'entend toujours en direct ; celle qui part suit ce que la passerelle a répondu. */
        public fun resolve(voice: TalkieHeaderVoice, phase: TalkieSendPhase, waking: Boolean): TalkieHeaderDelivery = when {
            voice != TalkieHeaderVoice.OUTGOING -> LIVE
            phase is TalkieSendPhase.RecordingCopy -> RECORDED
            waking -> RELAYED
            else -> LIVE
        }
    }
}

/**
 * Ce que l'en-tête montre selon la voix du talkie (#17315) : au repos, tout ; une voix en cours, le talkie prend toute la
 * barre — retour, identité et actions lui cèdent la place. Le (i) du talkie ne vit que sur la fiche (#17339).
 */
public data class TalkieHeaderChrome(
    val showsBackButton: Boolean,
    val showsIdentity: Boolean,
    val showsActions: Boolean,
    val talkieSpansBar: Boolean,
) {
    public companion object {
        public fun resolve(voice: TalkieHeaderVoice): TalkieHeaderChrome {
            val rest = voice == TalkieHeaderVoice.NONE
            return TalkieHeaderChrome(rest, rest, rest, !rest)
        }
    }
}

/** Niveau mesuré → hauteur des barres de l'onde (#17315, iso `TalkieWaveLaw`), borné et lissé. */
public object TalkieWaveLaw {
    /** En deçà, c'est le silence ; 0 dBFS est le plafond. */
    public const val FLOOR_DECIBELS: Float = -50f

    /** Montée rapide, descente lente : l'onde suit l'attaque d'une syllabe sans trembler entre deux. */
    public const val ATTACK: Float = 0.55f
    public const val RELEASE: Float = 0.12f

    /** La moyenne quadratique d'échantillons flottants (−1…1). */
    public fun rms(samples: FloatArray): Float {
        if (samples.isEmpty()) return 0f
        val energy = samples.fold(0.0) { acc, sample -> acc + sample * sample }
        return sqrt(energy / samples.size).toFloat()
    }

    /** La moyenne quadratique de [count] échantillons PCM 16 bits, ramenée à −1…1 ; appelée sur le fil audio. */
    public fun rms(samples: ShortArray, count: Int = samples.size): Float {
        val n = count.coerceIn(0, samples.size)
        if (n == 0) return 0f
        val energy = (0 until n).fold(0.0) { acc, i -> (samples[i] / 32_768.0).let { acc + it * it } }
        return sqrt(energy / n).toFloat()
    }

    /** 0 au plancher, 1 à pleine échelle, linéaire en décibels. */
    public fun normalized(rms: Float): Float {
        if (rms.isNaN() || rms <= 0f) return 0f
        val decibels = 20f * log10(rms)
        return clamp((decibels - FLOOR_DECIBELS) / -FLOOR_DECIBELS)
    }

    public fun smoothed(previous: Float, target: Float): Float {
        val goal = clamp(target)
        val from = clamp(previous)
        val rate = if (goal > from) ATTACK else RELEASE
        return clamp(from + (goal - from) * rate)
    }

    public fun barCount(width: Float, barWidth: Float, gap: Float): Int {
        val pitch = maxOf(barWidth + gap, 1f)
        val fitting = ((width + gap) / pitch).toInt()
        return fitting.coerceIn(1, TalkieWaveTrail.CAPACITY)
    }

    /** Les [barCount] derniers niveaux, le plus récent à droite ; ce qui manque à gauche est du silence. */
    public fun barHeights(levels: List<Float>, barCount: Int, minHeight: Float, maxHeight: Float): List<Float> {
        val count = maxOf(barCount, 0)
        val recent = levels.takeLast(count)
        val padded = List(count - recent.size) { 0f } + recent
        return padded.map { minHeight + (maxHeight - minHeight) * clamp(it) }
    }

    /**
     * L'onde du direct : un spectre miroir centré sur la voix de l'instant. Le centre mène, les bords suivent, et une houle
     * propre à chaque distance au centre l'anime sans briser la symétrie. Le silence pose toutes les barres au plancher.
     */
    public fun mirroredBarHeights(level: Float, barCount: Int, timeSeconds: Double, minHeight: Float, maxHeight: Float): List<Float> {
        val count = maxOf(barCount, 0)
        if (count == 0) return emptyList()
        val voice = clamp(level).toDouble()
        val centre = (count - 1) / 2.0
        val reach = maxOf(centre, 1.0)
        return List(count) { index ->
            val distance = abs(index - centre)
            val envelope = 0.3 + 0.7 * cos(distance / reach * PI / 2).pow(2)
            val swell = 0.78 + 0.22 * sin(timeSeconds * 8.3 + distance * 1.9) * cos(timeSeconds * 4.7 - distance * 0.8)
            val fill = (voice * envelope * swell).coerceIn(0.0, 1.0)
            minHeight + (maxHeight - minHeight) * fill.toFloat()
        }
    }

    /** Le chrono de la barre : `m:ss`, jamais négatif. */
    public fun elapsed(seconds: Double): String {
        val whole = if (seconds.isNaN() || seconds < 0) 0L else seconds.toLong()
        return "${whole / 60}:${(whole % 60).toString().padStart(2, '0')}"
    }

    private fun clamp(value: Float): Float = if (value.isNaN()) 0f else value.coerceIn(0f, 1f)
}

/**
 * La traîne de l'onde : le niveau lissé à chaque image, et un pas d'histoire à cadence fixe — l'onde défile au même
 * rythme à 60 comme à 120 Hz. Bornée. Valeur immuable : [advanced] rend la traîne d'après.
 */
public data class TalkieWaveTrail(
    val levels: List<Float> = emptyList(),
    private val smoothedLevel: Float = 0f,
    private val lastStepNanos: Long? = null,
) {
    public fun advanced(nowNanos: Long, level: Float): TalkieWaveTrail {
        val smoothed = TalkieWaveLaw.smoothed(smoothedLevel, level)
        val last = lastStepNanos
        if (last != null && nowNanos - last < STEP_NANOS) return copy(smoothedLevel = smoothed)
        return TalkieWaveTrail((levels + smoothed).takeLast(CAPACITY), smoothed, nowNanos)
    }

    public companion object {
        public const val CAPACITY: Int = 72
        public const val STEP_NANOS: Long = 1_000_000_000L / 30
    }
}
