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
    ): ClipWindowResolver.Window {
        val delta = geometry.time(translationPx)
        val engine = SnapEngine(geometry.dragSnapToleranceSeconds)
        fun snapped(raw: Float) = engine.snap(raw, candidates, snapDisabled)
        return when (handle) {
            Handle.START -> ClipWindowResolver.resolve(
                ClipWindowResolver.Edit.SetStart(snapped(from.start + delta).snappedTime), from,
            )
            Handle.END -> ClipWindowResolver.resolve(
                ClipWindowResolver.Edit.SetEnd(snapped(from.end + delta).snappedTime), from,
            )
            Handle.BODY -> {
                val rawStart = from.start + delta
                val head = snapped(rawStart)
                val tail = snapped(rawStart + from.duration)
                val shift = listOf(
                    head.takeIf { it.matched != null }?.let { it.snappedTime - rawStart },
                    tail.takeIf { it.matched != null }?.let { it.snappedTime - (rawStart + from.duration) },
                ).filterNotNull().minByOrNull { abs(it) } ?: 0f
                ClipWindowResolver.resolve(ClipWindowResolver.Edit.Move(rawStart + shift), from)
            }
        }
    }

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
