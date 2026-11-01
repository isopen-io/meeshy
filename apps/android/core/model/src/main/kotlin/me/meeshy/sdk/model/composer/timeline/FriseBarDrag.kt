package me.meeshy.sdk.model.composer.timeline

import kotlin.math.abs

/**
 * Le glissé d'une barre de la frise, en loi pure : un doigt déplacé de [translationPx] depuis
 * l'instant où la barre a été saisie rend la fenêtre qui en résulte. La poignée dit ce qui reste
 * FIXE (corps : la durée ; début : la fin ; fin : le début), [ClipWindowResolver] borne, et
 * [SnapEngine] aimante le bord qui bouge sur les candidats voisins (tête, bords des autres clips,
 * bords de la slide).
 */
object FriseBarDrag {

    enum class Handle { BODY, START, END }

    fun resolve(
        handle: Handle,
        from: ClipWindowResolver.Window,
        translationPx: Float,
        geometry: TimelineGeometry,
        candidates: List<SnapCandidate>,
        snapDisabled: Boolean = false,
    ): ClipWindowResolver.Window = resolveSnapped(handle, from, translationPx, geometry, candidates, snapDisabled).window

    /** Le glissé et si son bord mobile est ACCROCHÉ — ce qui fait sentir l'aimant au doigt (#14217, iso iOS). */
    data class Drag(val window: ClipWindowResolver.Window, val snapped: Boolean)

    fun resolveSnapped(
        handle: Handle,
        from: ClipWindowResolver.Window,
        translationPx: Float,
        geometry: TimelineGeometry,
        candidates: List<SnapCandidate>,
        snapDisabled: Boolean = false,
    ): Drag {
        val delta = geometry.time(translationPx)
        val engine = SnapEngine(geometry.dragSnapToleranceSeconds)
        fun shift(raw: Float): Float? = engine.snap(raw, candidates, snapDisabled)
            .takeIf { it.matched != null }?.let { it.snappedTime - raw }
        return when (handle) {
            Handle.START -> {
                val raw = from.start + delta
                val s = shift(raw)
                Drag(ClipWindowResolver.resolve(ClipWindowResolver.Edit.SetStart(raw + (s ?: 0f)), from), s != null)
            }
            Handle.END -> {
                val raw = from.end + delta
                val s = shift(raw)
                Drag(ClipWindowResolver.resolve(ClipWindowResolver.Edit.SetEnd(raw + (s ?: 0f)), from), s != null)
            }
            Handle.BODY -> {
                val rawStart = from.start + delta
                val s = listOfNotNull(shift(rawStart), shift(rawStart + from.duration)).minByOrNull { abs(it) }
                Drag(ClipWindowResolver.resolve(ClipWindowResolver.Edit.Move(rawStart + (s ?: 0f)), from), s != null)
            }
        }
    }

    /** Une fenêtre telle qu'elle se range sur l'objet : `duration == 0` = permanent (jusqu'à la fin de la slide). */
    data class Stored(val startSeconds: Float, val durationSeconds: Float)

    /**
     * Range une fenêtre de la frise : une fenêtre qui court jusqu'au bout de la slide reste
     * PERMANENTE (la durée `0` se préserve, allonger la slide ne raccourcit pas l'objet) ; sinon
     * début + durée.
     */
    fun stored(window: ClipWindowResolver.Window, slideDuration: Float): Stored =
        if (window.end >= slideDuration - PERMANENT_EPSILON) Stored(window.start, 0f)
        else Stored(window.start, window.duration)

    private const val PERMANENT_EPSILON = 0.05f

    /** Les points d'accroche d'un glissé : tout ce qui est voisin, jamais la barre elle-même. */
    fun candidates(
        tracks: List<Plan2DTrack>,
        draggedTrackId: String,
        playhead: Float,
        slideDuration: Float,
    ): List<SnapCandidate> = buildList {
        add(SnapCandidate(SnapCandidate.Kind.SLIDE_START, 0f))
        add(SnapCandidate(SnapCandidate.Kind.SLIDE_END, slideDuration))
        add(SnapCandidate(SnapCandidate.Kind.PLAYHEAD, playhead))
        tracks.filter { it.id != draggedTrackId }.forEach { track ->
            (track.bar as? TrackBar.Timed)?.let {
                add(SnapCandidate(SnapCandidate.Kind.CLIP_START, it.start.toFloat()))
                add(SnapCandidate(SnapCandidate.Kind.CLIP_END, it.end.toFloat()))
            }
            track.keyframeTimes.forEach { add(SnapCandidate(SnapCandidate.Kind.KEYFRAME, it.toFloat())) }
        }
    }
}
