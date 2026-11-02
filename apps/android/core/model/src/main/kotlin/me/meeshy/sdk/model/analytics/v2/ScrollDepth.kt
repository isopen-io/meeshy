package me.meeshy.sdk.model.analytics.v2

import java.util.UUID
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Le défilement agrégé par passage, jamais par image : une structure de taille fixe faite
 * d'entiers, décimée à 10 Hz par l'horloge fournie. Miroir de `ScrollDepthAccumulator` (iOS) ;
 * les points sont des dp.
 */
class ScrollDepthAccumulator {
    data class State(
        val lastSampleMs: Int? = null,
        val lastOffset: Int? = null,
        val lastDirection: Int = 0,
        val stillSinceMs: Int? = null,
        val stopCounted: Boolean = false,
        val lastBucket: Int = 0,
        val distance: Int = 0,
        val upDistance: Int = 0,
        val directionChanges: Int = 0,
        val activeScrollMs: Int = 0,
        val flings: Int = 0,
        val stops: Int = 0,
        val buckets: List<Int> = listOf(0, 0, 0, 0),
        val maxPosition: Int = 0,
        val itemsViewable: Int = 0,
        val refreshes: Int = 0,
        val paginations: Int = 0,
        val reachedEnd: Boolean = false,
    )

    var state: State = State()
        private set

    val distanceDp: Int get() = state.distance
    val activeScrollMs: Int get() = state.activeScrollMs
    val directionChanges: Int get() = state.directionChanges
    val flings: Int get() = state.flings
    val stops: Int get() = state.stops
    val maxPosition: Int get() = state.maxPosition
    val itemsViewable: Int get() = state.itemsViewable
    val refreshes: Int get() = state.refreshes
    val paginations: Int get() = state.paginations
    val reachedEnd: Boolean get() = state.reachedEnd

    /** Ms passées dans chaque classe de vitesse : <500, 500–1500, 1500–4000, ≥4000 dp/s. */
    val velocityHistogram: List<Int> get() = state.buckets

    val upDistanceRatio: Double
        get() = if (state.distance > 0) {
            SocialEventV2Wire.fraction(state.upDistance.toDouble() / state.distance)
        } else {
            0.0
        }

    /** Un échantillon de position (dp). Rend `false` s'il est décimé (< 100 ms du précédent). */
    fun sample(offsetDp: Double, atMs: Int): Boolean {
        val s = state
        val offset = offsetDp.roundToInt()
        val previousMs = s.lastSampleMs
        val previousOffset = s.lastOffset
        if (previousMs == null || previousOffset == null) {
            state = s.copy(lastSampleMs = atMs, lastOffset = offset, stillSinceMs = atMs)
            return true
        }
        val elapsed = atMs - previousMs
        if (elapsed < MIN_SAMPLE_INTERVAL_MS) return false
        val delta = offset - previousOffset
        val moved = s.copy(lastSampleMs = atMs, lastOffset = offset)
        state = if (delta == 0) still(moved, atMs) else moving(moved, delta, elapsed, atMs)
        return true
    }

    private fun still(s: State, atMs: Int): State {
        val since = s.stillSinceMs ?: atMs
        val base = s.copy(stillSinceMs = since, lastBucket = 0)
        if (s.stopCounted || atMs - since < STOP_THRESHOLD_MS || s.distance <= 0) return base
        return base.copy(stops = s.stops + 1, stopCounted = true)
    }

    private fun moving(s: State, delta: Int, elapsed: Int, atMs: Int): State {
        val step = minOf(elapsed, MAX_STEP_MS)
        val magnitude = abs(delta)
        val direction = if (delta > 0) 1 else -1
        val bucket = bucketOf(magnitude * 1_000 / maxOf(1, elapsed))
        val buckets = s.buckets.toMutableList().also { it[bucket] = it[bucket] + step }
        return s.copy(
            distance = s.distance + magnitude,
            activeScrollMs = s.activeScrollMs + step,
            stillSinceMs = atMs,
            stopCounted = false,
            upDistance = if (direction < 0) s.upDistance + magnitude else s.upDistance,
            directionChanges = if (s.lastDirection != 0 && direction != s.lastDirection) s.directionChanges + 1 else s.directionChanges,
            lastDirection = direction,
            buckets = buckets,
            flings = if (bucket == 3 && s.lastBucket != 3) s.flings + 1 else s.flings,
            lastBucket = bucket,
        )
    }

    fun noteRendered(position: Int) { state = state.copy(maxPosition = maxOf(state.maxPosition, position)) }
    fun noteViewable() { state = state.copy(itemsViewable = state.itemsViewable + 1) }
    fun noteRefresh() { state = state.copy(refreshes = state.refreshes + 1) }
    fun notePagination() { state = state.copy(paginations = state.paginations + 1) }
    fun noteReachedEnd() { state = state.copy(reachedEnd = true) }

    companion object {
        const val MIN_SAMPLE_INTERVAL_MS = 100

        /** Un écart plus long n'est pas du défilement continu : il est borné. */
        const val MAX_STEP_MS = 1_000
        const val STOP_THRESHOLD_MS = 1_000
        const val VELOCITY_LOW = 500
        const val VELOCITY_MID = 1_500
        const val VELOCITY_HIGH = 4_000

        fun bucketOf(dpPerSecond: Int): Int = when {
            dpPerSecond < VELOCITY_LOW -> 0
            dpPerSecond < VELOCITY_MID -> 1
            dpPerSecond < VELOCITY_HIGH -> 2
            else -> 3
        }
    }
}

/**
 * Un PASSAGE dans un listing : un `scroll.listing` à la sortie, au passage en arrière-plan,
 * après 30 s sans défilement suivies d'une reprise, ou en segment toutes les 60 s.
 */
class ScrollListingSession(
    val listingSessionId: String = UUID.randomUUID().toString().lowercase(),
    startedAtMs: Int,
) {
    var segment: Int = 0
        private set
    private var segmentStartMs: Int = startedAtMs
    private var accumulator = ScrollDepthAccumulator()
    private var baseline: ScrollDepthAccumulator.State = accumulator.state

    /** Rend un segment quand le passage dépasse 60 s, sinon `null`. */
    fun sample(offsetDp: Double, atMs: Int): ScrollListingSummary? {
        accumulator.sample(offsetDp, atMs)
        if (atMs - segmentStartMs < SEGMENT_MS) return null
        return closeSegment(atMs)
    }

    fun noteRendered(position: Int) = accumulator.noteRendered(position)
    fun noteViewable() = accumulator.noteViewable()
    fun noteRefresh() = accumulator.noteRefresh()
    fun notePagination() = accumulator.notePagination()
    fun noteReachedEnd() = accumulator.noteReachedEnd()

    /** La fin du passage : `null` si rien ne s'y est passé depuis le dernier segment. */
    fun finish(atMs: Int): ScrollListingSummary? {
        if (segment != 0 && accumulator.state == baseline) return null
        return closeSegment(atMs)
    }

    private fun closeSegment(atMs: Int): ScrollListingSummary {
        val a = accumulator
        val summary = ScrollListingSummary(
            listingSessionId = listingSessionId,
            segment = segment,
            durationMs = maxOf(0, atMs - segmentStartMs),
            activeScrollMs = a.activeScrollMs,
            itemsRendered = a.maxPosition + 1,
            itemsViewable = a.itemsViewable,
            maxPosition = a.maxPosition,
            distancePt = a.distanceDp,
            velocityHistogram = a.velocityHistogram,
            directionChanges = a.directionChanges,
            upDistanceRatio = a.upDistanceRatio,
            flings = a.flings,
            stops = a.stops,
            refreshes = a.refreshes,
            paginations = a.paginations,
            reachedEnd = a.reachedEnd,
        )
        segment += 1
        segmentStartMs = atMs
        accumulator = ScrollDepthAccumulator().also { it.noteRendered(a.maxPosition) }
        baseline = accumulator.state
        return summary
    }

    companion object {
        const val SEGMENT_MS = 60_000
    }
}

/**
 * Les passages successifs d'un listing : une reprise après plus de 30 s sans défilement ferme le
 * passage précédent et en ouvre un nouveau (la logique que l'app iOS tient dans son tracker, ici
 * pure et testable). `finish` couvre la sortie et l'arrière-plan.
 */
class ScrollListingPassages(private val idGenerator: () -> String = { UUID.randomUUID().toString().lowercase() }) {
    private var session: ScrollListingSession? = null
    private var lastSampleMs: Int? = null

    /** Les résumés à émettre (zéro, un ou deux) après ce relevé d'offset. */
    fun noteOffset(offsetDp: Double, atMs: Int): List<ScrollListingSummary> {
        val closed = lastSampleMs?.takeIf { atMs - it > IDLE_GAP_MS }?.let { finish(atMs) }
        lastSampleMs = atMs
        val current = session ?: ScrollListingSession(idGenerator(), atMs).also { session = it }
        return listOfNotNull(closed, current.sample(offsetDp, atMs))
    }

    fun noteRendered(position: Int) { session?.noteRendered(position) }
    fun noteViewable() { session?.noteViewable() }
    fun noteRefresh() { session?.noteRefresh() }
    fun notePagination() { session?.notePagination() }
    fun noteReachedEnd() { session?.noteReachedEnd() }

    fun finish(atMs: Int): ScrollListingSummary? {
        val current = session ?: return null
        session = null
        lastSampleMs = null
        return current.finish(atMs)
    }

    companion object {
        const val IDLE_GAP_MS = 30_000
    }
}

/** Un contenu ouvert : carrousel (index), texte long ou commentaires (fraction). */
class ScrollContentAccumulator(
    val contentKind: ScrollContentSummary.ContentKind,
    val itemsTotal: Int? = null,
    private val startedAtMs: Int,
) {
    private var maxIndex: Int? = null
    private var swipes = 0
    private var maxFraction: Double? = null
    private var readThrough: Double? = null

    fun noteIndex(index: Int) {
        val previous = maxIndex
        maxIndex = maxOf(previous ?: 0, index)
        if (previous != null || index > 0) swipes += 1
    }

    fun noteScroll(fraction: Double, readThrough: Double? = null) {
        maxFraction = maxOf(maxFraction ?: 0.0, SocialEventV2Wire.fraction(fraction))
        if (readThrough != null) {
            this.readThrough = maxOf(this.readThrough ?: 0.0, SocialEventV2Wire.fraction(readThrough))
        }
    }

    /** `null` quand le lecteur n'a pas bougé : un contenu non parcouru ne dit rien. */
    fun finish(atMs: Int): ScrollContentSummary? {
        if (maxIndex == null && maxFraction == null) return null
        return ScrollContentSummary(
            contentKind = contentKind,
            itemsTotal = itemsTotal ?: 0,
            maxIndexReached = maxIndex ?: 0,
            swipes = swipes,
            maxScrollFraction = maxFraction ?: 0.0,
            readThroughFraction = readThrough ?: maxFraction ?: 0.0,
            durationMs = maxOf(0, atMs - startedAtMs),
        )
    }
}
