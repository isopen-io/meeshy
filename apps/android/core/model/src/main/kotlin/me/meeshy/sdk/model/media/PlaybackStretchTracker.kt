package me.meeshy.sdk.model.media

/**
 * Trace fidèle de l'interaction d'un participant avec un média — miroir de
 * `PlaybackStretchTracker` (iOS, `PlaybackStretchTracker.swift`).
 *
 * Aucun échantillonnage périodique : le lecteur connaît les frontières exactes (lecture,
 * pause, déplacement du curseur, son coupé, fin du média, écran quitté) ; chaque intervalle
 * entre deux frontières est une plage continue exacte, quelle que soit sa durée. Aucune
 * horloge, aucun timer : l'appelant fournit la position média à chaque frontière.
 *
 * Immuable : chaque transition rend le nouvel état ; le propriétaire (le lecteur) garde le
 * dernier. Les plages sont rendues dans l'ordre CHRONOLOGIQUE, pas celui des positions.
 */
public class PlaybackStretchTracker private constructor(
    private val openedAtMs: Int?,
    private val lastObservedMs: Int,
    private val stretches: List<PlaybackStretch>,
) {
    public constructor() : this(null, 0, emptyList())

    public val hasOpenStretch: Boolean get() = openedAtMs != null

    /** Début d'une lecture continue ; une ouverture sur une plage ouverte la conserve (superseded). */
    public fun begin(positionMs: Int): PlaybackStretchTracker {
        val base = if (openedAtMs != null) close(positionMs, StretchEnd.SUPERSEDED) else this
        return PlaybackStretchTracker(positionMs, positionMs, base.stretches)
    }

    /** Met à jour la position connue sans rien clore. */
    public fun observe(positionMs: Int): PlaybackStretchTracker =
        PlaybackStretchTracker(openedAtMs, positionMs, stretches)

    public fun pause(positionMs: Int? = null): PlaybackStretchTracker = close(positionMs ?: lastObservedMs, StretchEnd.PAUSE)

    public fun muted(positionMs: Int? = null): PlaybackStretchTracker = close(positionMs ?: lastObservedMs, StretchEnd.MUTED)

    public fun completed(positionMs: Int? = null): PlaybackStretchTracker =
        close(positionMs ?: lastObservedMs, StretchEnd.COMPLETED)

    public fun dismissed(positionMs: Int? = null): PlaybackStretchTracker =
        close(positionMs ?: lastObservedMs, StretchEnd.DISMISSED)

    public fun superseded(positionMs: Int? = null): PlaybackStretchTracker =
        close(positionMs ?: lastObservedMs, StretchEnd.SUPERSEDED)

    /**
     * Déplacement du curseur : clôt la plage en cours et en ouvre une autre. À l'arrêt, il
     * n'ouvre rien — parcourir la barre de progression ne fabrique pas une écoute.
     */
    public fun seek(from: Int, to: Int): PlaybackStretchTracker {
        val wasPlaying = openedAtMs != null
        val closed = close(from, StretchEnd.SEEK)
        return PlaybackStretchTracker(if (wasPlaying) to else null, to, closed.stretches)
    }

    /** Rend les plages terminées (ordre chronologique) et les retire ; la plage ouverte est conservée. */
    public fun drain(): Pair<List<PlaybackStretch>, PlaybackStretchTracker> =
        stretches to PlaybackStretchTracker(openedAtMs, lastObservedMs, emptyList())

    private fun close(positionMs: Int, endedBy: StretchEnd): PlaybackStretchTracker {
        val start = openedAtMs ?: return PlaybackStretchTracker(null, positionMs, stretches)
        // Durée nulle ou négative : le lecteur se contredit, mieux vaut perdre l'observation.
        val next = if (positionMs > start) stretches + PlaybackStretch(start, positionMs, endedBy) else stretches
        return PlaybackStretchTracker(null, positionMs, next)
    }
}
