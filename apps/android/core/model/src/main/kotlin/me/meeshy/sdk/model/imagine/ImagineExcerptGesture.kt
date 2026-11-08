package me.meeshy.sdk.model.imagine

import kotlin.math.abs

/**
 * **Le geste de la bande d'extrait** — progressif et annulable : la fenêtre suit le doigt image par image, revenir en
 * arrière la ramène, et ce n'est qu'au lever du doigt que la carte se repeint. Un simple toucher centre la fenêtre là où
 * il tombe ; TalkBack la déplace de cinq secondes en cinq secondes.
 *
 * LE TEMPS SE LIT DE GAUCHE À DROITE dans toutes les langues ([isLeftToRight]), comme l'onde peinte sur la carte : une
 * bande retournée en arabe placerait le début du son à l'opposé de celui de la carte qu'elle découpe.
 */
object ImagineExcerptGesture {
    const val ACCESSIBILITY_STEP_SECONDS = 5.0
    private const val MIN_MOVE_SECONDS = 0.05
    private const val TAP_SLOP_FRACTION = 0.02

    /** La bande ne se miroite jamais. */
    const val isLeftToRight: Boolean = true

    /** Le plus tard où la fenêtre peut commencer. */
    fun latestStart(excerpt: ImagineExcerpt): Double = maxOf(0.0, excerpt.totalSeconds - excerpt.windowSeconds)

    fun clamped(excerpt: ImagineExcerpt, start: Double): Double =
        if (start.isFinite()) start.coerceIn(0.0, latestStart(excerpt)) else excerpt.startSeconds

    /** Où est la fenêtre pendant le glissement : [dragFraction] est le déplacement en part de la largeur de la bande. */
    fun dragged(excerpt: ImagineExcerpt, originStart: Double, dragFraction: Double): Double =
        clamped(excerpt, originStart + dragFraction * excerpt.totalSeconds)

    /** Un toucher centre la fenêtre là où il tombe ([fraction] : sa position en part de la largeur). */
    fun tapped(excerpt: ImagineExcerpt, fraction: Double): Double =
        clamped(excerpt, fraction * excerpt.totalSeconds - excerpt.windowSeconds / 2)

    fun isTap(dragFraction: Double): Boolean = abs(dragFraction) < TAP_SLOP_FRACTION

    /** Le départ à remettre au lever du doigt, ou `null` quand il ne bouge pas assez pour repeindre la carte. */
    fun committed(excerpt: ImagineExcerpt, target: Double): Double? =
        clamped(excerpt, target).takeIf { abs(it - excerpt.startSeconds) > MIN_MOVE_SECONDS }

    /** Un pas TalkBack, de cinq secondes. */
    fun stepped(excerpt: ImagineExcerpt, increase: Boolean): Double? =
        committed(excerpt, excerpt.startSeconds + if (increase) ACCESSIBILITY_STEP_SECONDS else -ACCESSIBILITY_STEP_SECONDS)

    /** Les hauteurs de la bande : une règle égale pour une vidéo, sinon l'onde du son rééchantillonnée. */
    fun levels(excerpt: ImagineExcerpt, samples: List<Double>, count: Int): List<Double> = when {
        count <= 0 -> emptyList()
        excerpt.soundId == null -> List(count) { RULER_LEVEL }
        samples.isEmpty() -> ImagineWaveform.synthetic(excerpt.soundId, count)
        else -> ImagineWaveform.resample(samples, count)
    }

    private const val RULER_LEVEL = 0.3
}

/** L'onde d'un son : stable tant qu'il n'a pas été lu (dérivée de son identifiant), rééchantillonnée en barres. */
object ImagineWaveform {

    /** Une onde STABLE dérivée de [seed] : elle ne change pas d'un aperçu à l'autre. */
    fun synthetic(seed: String, count: Int): List<Double> {
        if (count <= 0) return emptyList()
        var state = FNV_OFFSET
        for (byte in seed.toByteArray(Charsets.UTF_8)) {
            state = state xor (byte.toLong() and 0xFF)
            state *= FNV_PRIME
        }
        return List(count) { index ->
            state = state * LCG_MUL + LCG_ADD
            val noise = ((state ushr 33).toULong() % 1000uL).toDouble() / 1000
            val swell = 0.5 + 0.5 * kotlin.math.sin(index.toDouble() / maxOf(count, 1) * Math.PI)
            0.18 + 0.82 * (0.55 * noise + 0.45 * swell)
        }
    }

    /** Ramène une amplitude à [count] barres : la moyenne de chaque tranche. */
    fun resample(samples: List<Double>, count: Int): List<Double> {
        if (count <= 0 || samples.isEmpty()) return emptyList()
        return List(count) { bar ->
            val start = bar * samples.size / count
            val end = maxOf(start + 1, (bar + 1) * samples.size / count)
            samples.subList(start, minOf(end, samples.size)).average()
        }
    }

    private const val FNV_OFFSET = -3750763034362895579L
    private const val FNV_PRIME = 0x0000_0100_0000_01b3L
    private const val LCG_MUL = 6_364_136_223_846_793_005L
    private const val LCG_ADD = 1_442_695_040_888_963_407L
}
