package me.meeshy.sdk.model.scene

/**
 * La boucle d'une piste de scène : UNE loi pour le premier plan et le fond — miroir de `ReaderLoopLaw`,
 * `ReaderAudioLoopPolicy` et `ReaderLoopEnvelope` (iOS, #9867, #10362, #10367).
 *
 * Une boucle n'a pas de fin : sa position est l'écoulé modulo la passe, et ses fondus se LISENT sur la phase du tour
 * (jamais posés une fois), si bien qu'une entrée en cours de boucle tombe d'elle-même à la bonne amplitude et que le
 * clip ne se tait plus après deux tours.
 */
public object SceneAudioLoopLaw {

    /** L'écoulé d'une entrée en boucle se replie sur UNE passe ; une passe nulle ou non finie le rend tel quel. */
    public fun elapsedInPass(elapsedInClip: Double, passLength: Double): Double {
        if (!elapsedInClip.isFinite() || elapsedInClip <= 0.0) return 0.0
        if (!passLength.isFinite() || passLength <= 0.0) return elapsedInClip
        return elapsedInClip % passLength
    }

    /** Durée d'UNE passe : la fenêtre de rognage, ou la source entière ; `null` tant que la source est inconnue. */
    public fun passLength(sourceSeconds: Double?, windowStartMs: Long?, windowEndMs: Long?): Double? {
        val start = (windowStartMs ?: 0L) / MS
        val end = windowEndMs?.let { it / MS } ?: sourceSeconds ?: return null
        val bounded = sourceSeconds?.let { minOf(end, it) } ?: end
        return maxOf(0.0, bounded - start)
    }

    /** Qui boucle : la déclaration de l'auteur (un fond boucle sauf refus, un clip une fois), sauf en aperçu d'édition. */
    public fun loops(declared: Boolean?, isBackground: Boolean, isEditPreview: Boolean): Boolean =
        isEditPreview || (declared ?: isBackground)

    /** Durée d'un tour d'enveloppe : la durée occupée d'une boucle déclarée, sinon la passe réelle. */
    public fun envelopeCycle(declaredLoop: Boolean, occupiedDuration: Double, passLength: Double): Double {
        val occupied = positive(occupiedDuration)
        val pass = positive(passLength)
        if (declaredLoop && occupied > 0) return occupied
        return if (pass > 0) pass else occupied
    }

    /** Volume à `elapsedInClip` (tous tours confondus) : montée sur [fadeIn], descente sur les [fadeOut] dernières secondes du tour. */
    public fun envelopeGain(elapsedInClip: Double, cycle: Double, fadeIn: Double, fadeOut: Double): Float {
        val phase = elapsedInPass(elapsedInClip, cycle)
        val rise = positive(fadeIn)
        val fall = positive(fadeOut)
        val span = positive(cycle)
        val rising = if (rise > 0) minOf(1.0, phase / rise) else 1.0
        val falling = if (fall > 0 && span > 0) minOf(1.0, maxOf(0.0, (span - phase) / fall)) else 1.0
        return minOf(rising, falling).toFloat()
    }

    private fun positive(seconds: Double): Double = if (seconds.isFinite() && seconds > 0) seconds else 0.0

    private const val MS = 1000.0
}
