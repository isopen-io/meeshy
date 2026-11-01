package me.meeshy.sdk.model.scene.export

/** Une plage lue d'un fichier, en millisecondes du fichier. */
public data class StoryExportClipRange(val startMillis: Long, val endMillis: Long) {
    val durationMillis: Long get() = endMillis - startMillis
}

/**
 * Un morceau d'un son tel que le moteur l'enchaîne : la plage lue du fichier, le silence posé devant (le premier morceau
 * seul, pour entrer à l'heure du son) et l'instant de la timeline commune où commence ce qu'il rend ([originMillis]).
 */
public data class StoryExportSoundSegment(val clipStartMillis: Long, val clipEndMillis: Long, val leadMillis: Long, val originMillis: Long)

/**
 * **LA LECTURE D'UN FICHIER DANS SA FENÊTRE** (#13872 ; miroir de `soundSchedule`, web) — la coupe de l'auteur, puis la
 * boucle : des tours entiers, et un dernier tour coupé à la fin de la fenêtre. Une coupe vieillie (hors du fichier, ou
 * vide) relit le fichier entier plutôt que de taire le son. Pure : la durée du fichier est REÇUE (sondée sur l'appareil).
 */
public object StoryExportClipLoop {
    public const val MAX_SEGMENTS: Int = 512

    /** Le plus court tour qu'une vidéo lit : en deçà, aucune image ne le remplit et le moteur n'a rien à rendre (#13897). */
    public const val MIN_VIDEO_LAP_MILLIS: Long = 100L

    public fun ranges(lengthMillis: Long, trimStartMillis: Long, trimEndMillis: Long?, clipDurationMillis: Long, loop: Boolean): List<StoryExportClipRange> {
        if (clipDurationMillis <= 0L || lengthMillis <= 0L) return emptyList()
        val start = trimStartMillis.coerceIn(0L, clipDurationMillis)
        val declaredEnd = trimEndMillis?.let { minOf(it, clipDurationMillis) } ?: clipDurationMillis
        val (from, to) = if (declaredEnd > start) start to declaredEnd else 0L to clipDurationMillis
        val period = to - from
        if (!loop) return listOf(StoryExportClipRange(from, from + minOf(period, lengthMillis)))
        val laps = mutableListOf<StoryExportClipRange>()
        var remaining = lengthMillis
        while (remaining > 0L && laps.size < MAX_SEGMENTS) {
            val taken = minOf(period, remaining)
            laps += StoryExportClipRange(from, from + taken)
            remaining -= taken
        }
        return laps
    }

    /**
     * Les tours d'une VIDÉO ([ranges]) dont le dernier tient au moins [MIN_VIDEO_LAP_MILLIS] : un dernier tour trop court
     * emprunte au tour d'avant, qui finit d'autant plus tôt ; la durée totale ne bouge pas (#13897, recette S8).
     */
    public fun videoLaps(lengthMillis: Long, trimStartMillis: Long, trimEndMillis: Long?, clipDurationMillis: Long, loop: Boolean): List<StoryExportClipRange> {
        val laps = ranges(lengthMillis, trimStartMillis, trimEndMillis, clipDurationMillis, loop)
        val last = laps.lastOrNull() ?: return laps
        val before = laps.getOrNull(laps.size - 2) ?: return laps
        val borrowed = MIN_VIDEO_LAP_MILLIS - last.durationMillis
        if (borrowed <= 0L || before.durationMillis - borrowed < MIN_VIDEO_LAP_MILLIS) return laps
        return laps.dropLast(2) +
            StoryExportClipRange(before.startMillis, before.endMillis - borrowed) +
            StoryExportClipRange(last.startMillis, last.startMillis + MIN_VIDEO_LAP_MILLIS)
    }

    /**
     * Les morceaux d'un son placé ; aucun quand il est muet de bout en bout. Un fichier dont la durée n'a pu se sonder se lit
     * une fois sur sa fenêtre, depuis sa coupe : sans durée, aucun tour ne peut se compter.
     */
    public fun soundSegments(sound: StoryExportSound, clipDurationMillis: Long?): List<StoryExportSoundSegment> {
        if (sound.gain <= 0f && sound.envelope.none { it.gain > 0f }) return emptyList()
        val window = sound.endMillis - sound.startMillis
        if (window <= 0L) return emptyList()
        val clip = clipDurationMillis?.takeIf { it > 0L }
        val ranges = if (clip != null) {
            ranges(window, sound.trimStartMillis, sound.trimEndMillis, clip, sound.loop)
        } else {
            val from = sound.trimStartMillis.coerceAtLeast(0L)
            val to = sound.trimEndMillis?.takeIf { it > from }?.let { minOf(it, from + window) } ?: (from + window)
            listOf(StoryExportClipRange(from, to))
        }
        var cursor = sound.startMillis
        return ranges.mapIndexed { index, range ->
            val first = index == 0
            StoryExportSoundSegment(range.startMillis, range.endMillis, if (first) sound.startMillis else 0L, if (first) 0L else cursor)
                .also { cursor += range.durationMillis }
        }
    }
}

/** La courbe de volume d'un son lue à un instant : interpolation linéaire, le gain fixe sans courbe. */
public object StoryExportVolumeCurve {

    public fun gainAt(envelope: List<StoryExportVolumePoint>, gain: Float, atMillis: Long): Float {
        if (envelope.isEmpty()) return gain
        if (atMillis <= envelope.first().atMillis) return envelope.first().gain
        if (atMillis >= envelope.last().atMillis) return envelope.last().gain
        val after = envelope.indexOfFirst { it.atMillis > atMillis }
        return between(envelope[after - 1], envelope[after], atMillis)
    }

    /** La courbe arrêtée à [endMillis] : ses points d'après tombent, son bord est interpolé là où elle continuait. */
    public fun clipped(envelope: List<StoryExportVolumePoint>, endMillis: Long): List<StoryExportVolumePoint> {
        val kept = envelope.filter { it.atMillis <= endMillis }
        val next = envelope.firstOrNull { it.atMillis > endMillis }
        val last = kept.lastOrNull()
        if (next == null || last == null || last.atMillis == endMillis) return kept
        return kept + StoryExportVolumePoint(endMillis, between(last, next, endMillis))
    }

    private fun between(low: StoryExportVolumePoint, high: StoryExportVolumePoint, atMillis: Long): Float {
        val span = high.atMillis - low.atMillis
        if (span <= 0L) return high.gain
        return low.gain + (high.gain - low.gain) * (atMillis - low.atMillis) / span.toFloat()
    }
}
