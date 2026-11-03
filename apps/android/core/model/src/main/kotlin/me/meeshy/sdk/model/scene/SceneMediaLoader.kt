package me.meeshy.sdk.model.scene

/** Ce qu'un média choisi est : une image ou une vidéo (le libellé de chargement et la mesure en dépendent). */
enum class SceneMediaKind { IMAGE, VIDEO }

/**
 * Ce qu'une vidéo dit d'elle-même, lue UNE fois, de la même façon pour la galerie et la caméra : ses dimensions DEBOUT
 * (rotation du conteneur appliquée), son ratio et sa durée. Le ratio n'est jamais perdu : une vidéo prise en portrait est
 * stockée en paysage avec une rotation de 90°, et la lire sans cette rotation poserait un 16:9 là où la scène voit du 9:16.
 */
data class SceneVideoMeasure(val width: Int, val height: Int, val durationMillis: Long?) {
    val aspectRatio: Double get() = width.toDouble() / height

    val durationSeconds: Double? get() = durationMillis?.let { it / MILLIS_PER_SECOND }

    companion object {
        private const val MILLIS_PER_SECOND = 1000.0
        private const val HALF_TURN = 180
        private const val FULL_TURN = 360

        /** `null` tant que les dimensions manquent ou sont dégénérées ; une durée nulle ou négative est inconnue, pas zéro. */
        fun of(rawWidth: Int?, rawHeight: Int?, rotationDegrees: Int?, durationMillis: Long?): SceneVideoMeasure? {
            if (rawWidth == null || rawHeight == null || rawWidth <= 0 || rawHeight <= 0) return null
            val quarter = ((rotationDegrees ?: 0) % FULL_TURN + FULL_TURN) % HALF_TURN != 0
            return SceneVideoMeasure(
                width = if (quarter) rawHeight else rawWidth,
                height = if (quarter) rawWidth else rawHeight,
                durationMillis = durationMillis?.takeIf { it > 0L },
            )
        }
    }
}

/**
 * Le chargement d'un média choisi, hors du fil principal : jamais décodé au-delà de 1080 px sur son grand côté (une photo
 * de 48 Mpx décodée entière ferait tomber l'appareil), et la forme de ce qu'on charge est connue avant le premier pixel
 * pour que l'espace réservé ne saute pas.
 */
object SceneMediaLoader {
    const val MAX_DECODE_EDGE: Int = 1080

    /** Le plus petit facteur de sous-échantillonnage (puissance de deux, comme `inSampleSize`) qui ramène le grand côté à [maxEdge]. */
    fun sampleSize(width: Int, height: Int, maxEdge: Int = MAX_DECODE_EDGE): Int {
        val longest = maxOf(width, height)
        if (longest <= 0 || maxEdge <= 0) return 1
        var sample = 1
        while (longest / sample > maxEdge) sample *= 2
        return sample
    }

    /** La taille finale, ratio conservé, dont le grand côté ne dépasse pas [maxEdge] ; inchangée quand elle tient déjà. */
    fun boundedSize(width: Int, height: Int, maxEdge: Int = MAX_DECODE_EDGE): Pair<Int, Int> {
        val longest = maxOf(width, height)
        if (longest <= maxEdge || width <= 0 || height <= 0 || maxEdge <= 0) return width to height
        val factor = maxEdge.toDouble() / longest
        return Math.round(width * factor).toInt().coerceAtLeast(1) to Math.round(height * factor).toInt().coerceAtLeast(1)
    }
}
