package me.meeshy.sdk.model.composer.timeline

import kotlin.math.abs

/** Un point d'accroche candidat de l'aimantation. */
data class SnapCandidate(
    val kind: Kind,
    val time: Float,
    val label: String? = null,
) {
    /** Nature d'un candidat — départage les égalités (voir [SnapEngine.priority]). */
    enum class Kind { PLAYHEAD, CLIP_START, CLIP_END, GRID_MAJOR, GRID_MINOR, KEYFRAME, SLIDE_START, SLIDE_END }
}

/** `matched == null` : aucune aimantation, [snappedTime] est le temps brut. */
data class SnapResult(val snappedTime: Float, val matched: SnapCandidate?)

/**
 * Aimantation pure (miroir de `SnapEngine.swift`) : choisit le meilleur candidat
 * dans la tolérance, la proximité d'abord, la priorité à distance égale.
 */
class SnapEngine(toleranceSeconds: Float) {

    val toleranceSeconds: Float = maxOf(0f, toleranceSeconds)

    fun snap(rawTime: Float, candidates: List<SnapCandidate>, disabled: Boolean = false): SnapResult {
        if (disabled || !rawTime.isFinite()) return SnapResult(rawTime, null)
        return pickBest(rawTime, candidates, toleranceSeconds)
    }

    companion object {
        private const val DISTANCE_EPSILON = 1e-6f

        /** Plus haut = gagne l'égalité : tête 70 > bords de clips 60 > keyframe 50 > grille majeure 40 > mineure 30 > slide 20. */
        fun priority(kind: SnapCandidate.Kind): Int = when (kind) {
            SnapCandidate.Kind.PLAYHEAD -> 70
            SnapCandidate.Kind.CLIP_START, SnapCandidate.Kind.CLIP_END -> 60
            SnapCandidate.Kind.KEYFRAME -> 50
            SnapCandidate.Kind.GRID_MAJOR -> 40
            SnapCandidate.Kind.GRID_MINOR -> 30
            SnapCandidate.Kind.SLIDE_START, SnapCandidate.Kind.SLIDE_END -> 20
        }

        internal fun pickBest(rawTime: Float, candidates: List<SnapCandidate>, tolerance: Float): SnapResult {
            var best: SnapCandidate? = null
            var bestDistance = 0f
            var bestPriority = 0
            for (candidate in candidates) {
                if (!candidate.time.isFinite()) continue
                val distance = abs(candidate.time - rawTime)
                if (distance > tolerance) continue
                val candidatePriority = priority(candidate.kind)
                val current = best
                val wins = current == null ||
                    distance < bestDistance - DISTANCE_EPSILON ||
                    (abs(distance - bestDistance) <= DISTANCE_EPSILON && candidatePriority > bestPriority)
                if (wins) {
                    best = candidate
                    bestDistance = distance
                    bestPriority = candidatePriority
                }
            }
            return best?.let { SnapResult(it.time, it) } ?: SnapResult(rawTime, null)
        }
    }
}
