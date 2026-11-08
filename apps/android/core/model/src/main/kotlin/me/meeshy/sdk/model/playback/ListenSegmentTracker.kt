package me.meeshy.sdk.model.playback

import me.meeshy.sdk.model.media.AttachmentStatusBody
import me.meeshy.sdk.model.media.PlaybackStatusReport
import me.meeshy.sdk.model.media.PlaybackStretch
import me.meeshy.sdk.model.media.PlaybackStretchTracker

/**
 * La trace d'écoute d'UN vocal, du point de vue du moteur : les frontières exactes (lecture, pause,
 * saut de curseur, fin, abandon) fermées en plages continues, puis le rapport `listened` que
 * l'entonnoir de consommation envoie.
 *
 * Posé sur [PlaybackStretchTracker] (la mécanique des plages, partagée avec la vidéo), il ajoute ce
 * que seul un moteur audio sait : la fin naturelle n'est comptée qu'UNE fois (`complete: true` ne
 * part pas deux fois pour la même écoute), et un rapport n'existe que s'il y a quelque chose à dire.
 * Immuable : chaque transition rend le nouvel état.
 */
public class ListenSegmentTracker private constructor(
    private val tracker: PlaybackStretchTracker,
    private val completionReported: Boolean,
) {
    public constructor() : this(PlaybackStretchTracker(), false)

    public val hasOpenSegment: Boolean get() = tracker.hasOpenStretch

    /** Une lecture continue commence ; une nouvelle écoute (boucle, relance) réarme la complétion. */
    public fun begin(positionMs: Long): ListenSegmentTracker =
        ListenSegmentTracker(tracker.begin(positionMs.toInt()), completionReported = false)

    public fun observe(positionMs: Long): ListenSegmentTracker =
        ListenSegmentTracker(tracker.observe(positionMs.toInt()), completionReported)

    public fun pause(positionMs: Long): ListenSegmentTracker =
        ListenSegmentTracker(tracker.pause(positionMs.toInt()), completionReported)

    /** Saut de curseur : coupe la plage en cours (à l'arrêt, ne fabrique aucune écoute). */
    public fun seek(fromMs: Long, toMs: Long): ListenSegmentTracker =
        ListenSegmentTracker(tracker.seek(fromMs.toInt(), toMs.toInt()), completionReported)

    /** Le vocal est lâché sans être fini (autre vocal choisi, arrêt) : l'écoute est close, pas finie. */
    public fun dismissed(positionMs: Long): ListenSegmentTracker =
        ListenSegmentTracker(tracker.dismissed(positionMs.toInt()), completionReported)

    /** Fin naturelle. Sans effet à la seconde demande : la complétion est comptée une fois. */
    public fun completed(durationMs: Long): ListenSegmentTracker =
        if (completionReported) this else ListenSegmentTracker(tracker.completed(durationMs.toInt()), true)

    /**
     * Vide les plages closes et en bâtit le rapport `listened` ; `null` quand il n'y a rien à dire
     * (aucune plage, aucune complétion). La plage encore ouverte reste dans le suivi.
     */
    public fun drainReport(
        positionMs: Long,
        durationMs: Long,
        language: String? = null,
    ): Pair<AttachmentStatusBody?, ListenSegmentTracker> {
        val (stretches: List<PlaybackStretch>, drained) = tracker.drain()
        val body = PlaybackStatusReport.build(
            action = AttachmentStatusBody.ACTION_LISTENED,
            stretches = stretches,
            positionMs = positionMs.toInt(),
            durationMs = durationMs.toInt(),
            language = language,
        )
        return body to ListenSegmentTracker(drained, completionReported)
    }
}
