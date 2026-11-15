package me.meeshy.sdk.model.media

import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryMediaObject

/** La fenêtre de source d'un média posé sur une scène — des BORNES, jamais un fichier cuit. */
public data class MediaTrimBounds(val start: Double, val end: Double) {

    public val duration: Double get() = maxOf(0.0, end - start)

    /** `null` ⇒ ne rien écrire : une fenêtre qui couvre le fichier entier n'est pas une fenêtre. */
    public fun persisted(sourceDuration: Double): MediaTrimBounds? {
        val coversAll = start <= EPSILON && end >= sourceDuration - EPSILON
        return if (coversAll) null else this
    }

    private companion object {
        const val EPSILON = 0.01
    }
}

/** Ce que rogner écrit : `start`/`end` nuls tant que rien n'est rogné, et TOUJOURS la durée. */
public data class MediaTrimFields(val start: Double?, val end: Double?, val duration: Double)

public object MediaTrimRule {

    /** En dessous, la poignée s'arrête contre sa voisine : jamais de croisement. */
    public const val MINIMUM_DURATION: Double = 0.4

    public fun full(sourceDuration: Double): MediaTrimBounds =
        MediaTrimBounds(0.0, maxOf(0.0, sourceDuration))

    /** Bornes persistées -> fenêtre lue ; `null` ou aberrantes valent la source entière. */
    public fun resolved(start: Double?, end: Double?, sourceDuration: Double): MediaTrimBounds {
        val whole = full(sourceDuration)
        if (!(sourceDuration > 0.0)) return whole
        val from = (start ?: 0.0).coerceIn(0.0, sourceDuration)
        val to = minOf(sourceDuration, maxOf(end ?: sourceDuration, 0.0))
        if (!(to - from >= MINIMUM_DURATION)) return whole
        return MediaTrimBounds(from, to)
    }

    /** Poignée de GAUCHE : ne franchit jamais la droite, ne pousse pas l'autre borne. */
    public fun movingStart(bounds: MediaTrimBounds, delta: Double, sourceDuration: Double): MediaTrimBounds {
        val ceiling = bounds.end - MINIMUM_DURATION
        val from = minOf(maxOf(0.0, bounds.start + delta), maxOf(0.0, ceiling))
        return MediaTrimBounds(from, bounds.end)
    }

    /** Poignée de DROITE, symétrique. */
    public fun movingEnd(bounds: MediaTrimBounds, delta: Double, sourceDuration: Double): MediaTrimBounds {
        val floor = bounds.start + MINIMUM_DURATION
        val to = maxOf(minOf(sourceDuration, bounds.end + delta), minOf(floor, sourceDuration))
        return MediaTrimBounds(bounds.start, to)
    }

    /** Translation en points -> secondes ; la largeur rendue représente la source ENTIÈRE. */
    public fun seconds(forHandleDelta: Float, stripWidth: Float, sourceDuration: Double): Double {
        if (!(stripWidth > 0f)) return 0.0
        return (forHandleDelta / stripWidth).toDouble() * sourceDuration
    }

    /** Rogner écrit TROIS champs, jamais deux : sans la durée, la story attendrait dans le vide. */
    public fun fields(bounds: MediaTrimBounds, sourceDuration: Double): MediaTrimFields {
        val window = bounds.persisted(sourceDuration)
            ?: return MediaTrimFields(null, null, maxOf(0.0, sourceDuration))
        return MediaTrimFields(window.start, window.end, window.duration)
    }
}

/** La fenêtre de source EFFECTIVE de ce média, bornes vieillies comprises. */
public fun StoryMediaObject.trimBounds(sourceDuration: Double): MediaTrimBounds =
    MediaTrimRule.resolved(sourceStart, sourceEnd, sourceDuration)

/** Jumelle pour un son de story (bornes en `Float`). */
public fun StoryAudioPlayerObject.trimBounds(sourceDuration: Double): MediaTrimBounds =
    MediaTrimRule.resolved(sourceStart?.toDouble(), sourceEnd?.toDouble(), sourceDuration)
