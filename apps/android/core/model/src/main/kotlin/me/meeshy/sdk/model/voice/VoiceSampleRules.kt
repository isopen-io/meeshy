package me.meeshy.sdk.model.voice

/**
 * Les règles de la collecte d'échantillons de voix — miroir de `VoiceRecordingView` (iOS) : au moins
 * [MINIMUM_SAMPLES] échantillons d'au moins [MINIMUM_DURATION_SECONDS] secondes chacun. Un échantillon plus
 * court est rejeté : le clonage a besoin de matière, et un texte lu en cinq secondes n'en donne pas.
 */
object VoiceSampleRules {
    const val MINIMUM_SAMPLES: Int = 3
    const val MINIMUM_DURATION_SECONDS: Int = 10

    private const val WORDS_PER_SECOND = 2.5

    fun isLongEnough(durationSeconds: Double, minimumSeconds: Int = MINIMUM_DURATION_SECONDS): Boolean =
        durationSeconds >= minimumSeconds

    /** Le bouton « Créer le profil vocal » n'est actif qu'avec assez d'échantillons. */
    fun canCreateProfile(sampleCount: Int, minimumSamples: Int = MINIMUM_SAMPLES): Boolean =
        sampleCount >= minimumSamples

    /** Secondes encore à tenir avant que la prise ne compte ; 0 une fois le plancher atteint. */
    fun remainingSeconds(elapsedSeconds: Double, minimumSeconds: Int = MINIMUM_DURATION_SECONDS): Int =
        kotlin.math.ceil(minimumSeconds - elapsedSeconds).toInt().coerceAtLeast(0)

    /** Durée de lecture à voix haute d'un texte (≈ 2,5 mots par seconde) : garantit qu'un texte suffit au plancher. */
    fun estimatedReadingSeconds(text: String): Double =
        text.trim().split(Regex("\\s+")).count { it.isNotEmpty() } / WORDS_PER_SECOND
}

/** Un échantillon accepté : [id] stable (la suppression vise l'identité, jamais l'indice), octets et durée. */
class VoiceSample(val id: Long, val bytes: ByteArray, val durationSeconds: Double)

/** Les échantillons enregistrés, immuables : ajouter ou retirer rend une nouvelle collection. */
class VoiceSampleSet private constructor(val samples: List<VoiceSample>, private val nextId: Long) {

    sealed interface Added {
        data class Accepted(val set: VoiceSampleSet) : Added
        data object TooShort : Added
    }

    val count: Int get() = samples.size

    fun add(bytes: ByteArray, durationSeconds: Double, minimumSeconds: Int = VoiceSampleRules.MINIMUM_DURATION_SECONDS): Added {
        if (!VoiceSampleRules.isLongEnough(durationSeconds, minimumSeconds)) return Added.TooShort
        return Added.Accepted(VoiceSampleSet(samples + VoiceSample(nextId, bytes, durationSeconds), nextId + 1))
    }

    fun remove(id: Long): VoiceSampleSet = VoiceSampleSet(samples.filterNot { it.id == id }, nextId)

    companion object {
        val empty: VoiceSampleSet = VoiceSampleSet(emptyList(), 1)
    }
}
