package me.meeshy.sdk.model.call

/** The media link as the journal names it — the ICE states that say something about the network. */
enum class CallNetworkLink(val label: String) {
    CONNECTING("connecting"),
    CONNECTED("connected"),
    DISCONNECTED("disconnected"),
    FAILED("failed"),
    ;

    companion object {
        fun fromLabel(label: String): CallNetworkLink? = entries.firstOrNull { it.label == label }
    }
}

/** What the call stack reports, as the journal recorder reads it — port of iOS `CallNetworkJournalInput`. */
sealed interface CallNetworkJournalInput {
    data class Call(val id: String?) : CallNetworkJournalInput
    data class State(val state: CallState) : CallNetworkJournalInput
    data class Link(val link: CallNetworkLink) : CallNetworkJournalInput
    data class Reading(val reading: CallQualityReading) : CallNetworkJournalInput
    data class Tier(val level: VideoQualityLevel) : CallNetworkJournalInput
    data class MediaFault(val reason: String) : CallNetworkJournalInput
}

/** The next recorder and the events to persist. */
data class CallNetworkJournalStep(val recorder: CallNetworkJournalRecorder, val events: List<CallNetworkEvent>)

/**
 * Turns the call stack's live signals into the bounded events of a call's network journal — port of iOS
 * `CallNetworkJournalRecorder` (#8698). Pure: [reducing] returns the next recorder and the events to persist.
 *
 * A reading is kept every [SAMPLE_INTERVAL_MS], or at once when loss, latency or jitter change grade — a stable link
 * costs four samples a minute, a degrading one is caught the moment it degrades. Nothing is recorded before a call id
 * is known nor after the call ended.
 */
data class CallNetworkJournalRecorder(
    val callId: String? = null,
    val startedAtMs: Long? = null,
    val hasEnded: Boolean = false,
    val isReconnecting: Boolean = false,
    val lastLink: CallNetworkLink? = null,
    val lastRelayed: Boolean? = null,
    val lastTier: VideoQualityLevel? = null,
    val lastSampleAtMs: Long? = null,
    val lastSampleGrades: List<CallQualityGrade?> = emptyList(),
) {
    fun reducing(input: CallNetworkJournalInput, nowMs: Long): CallNetworkJournalStep {
        if (input is CallNetworkJournalInput.Call) return startingCall(input.id, nowMs)
        if (callId == null || hasEnded) return unchanged()
        return when (input) {
            is CallNetworkJournalInput.Call -> unchanged()
            is CallNetworkJournalInput.State -> recordingState(input.state, nowMs)
            is CallNetworkJournalInput.Link ->
                if (input.link == lastLink) {
                    unchanged()
                } else {
                    step(copy(lastLink = input.link), nowMs, CallNetworkEventKind.Link(input.link.label))
                }
            is CallNetworkJournalInput.Reading -> recordingReading(input.reading, nowMs)
            is CallNetworkJournalInput.Tier ->
                if (input.level == lastTier) {
                    unchanged()
                } else {
                    step(copy(lastTier = input.level), nowMs, CallNetworkEventKind.Tier(tierLabel(input.level)))
                }
            is CallNetworkJournalInput.MediaFault -> step(this, nowMs, CallNetworkEventKind.MediaFault(input.reason))
        }
    }

    private fun startingCall(id: String?, nowMs: Long): CallNetworkJournalStep {
        if (id.isNullOrBlank() || id == callId) return unchanged()
        return CallNetworkJournalStep(CallNetworkJournalRecorder(callId = id, startedAtMs = nowMs), emptyList())
    }

    private fun recordingState(state: CallState, nowMs: Long): CallNetworkJournalStep = when {
        state is CallState.Reconnecting ->
            step(copy(isReconnecting = true), nowMs, CallNetworkEventKind.Reconnecting(state.attempt))
        state is CallState.Connected && isReconnecting ->
            step(copy(isReconnecting = false), nowMs, CallNetworkEventKind.Reconnected)
        state is CallState.Ended ->
            step(copy(hasEnded = true), nowMs, CallNetworkEventKind.Ended(endLabel(state.reason)))
        else -> unchanged()
    }

    private fun recordingReading(reading: CallQualityReading, nowMs: Long): CallNetworkJournalStep {
        val route = reading.relayed?.takeIf { it != lastRelayed }?.let { CallNetworkEventKind.Route(it) }
        val grades = grades(reading)
        val isDue = lastSampleAtMs?.let { nowMs - it >= SAMPLE_INTERVAL_MS } ?: true
        val sample = if (isDue || grades != lastSampleGrades) CallNetworkEventKind.Sample(sampleOf(reading)) else null
        val next = copy(
            lastRelayed = reading.relayed ?: lastRelayed,
            lastSampleAtMs = if (sample == null) lastSampleAtMs else nowMs,
            lastSampleGrades = if (sample == null) lastSampleGrades else grades,
        )
        return CallNetworkJournalStep(next, listOfNotNull(route, sample).map { CallNetworkEvent(nowMs, it) })
    }

    private fun step(next: CallNetworkJournalRecorder, nowMs: Long, kind: CallNetworkEventKind) =
        CallNetworkJournalStep(next, listOf(CallNetworkEvent(nowMs, kind)))

    private fun unchanged() = CallNetworkJournalStep(this, emptyList())

    companion object {
        const val SAMPLE_INTERVAL_MS: Long = 15_000L

        val Idle = CallNetworkJournalRecorder()

        /** The wire spelling of iOS `CallNetworkJournalRecorder.label(of:)`, so both journals read alike. */
        fun endLabel(reason: CallEndReason): String = when (reason) {
            CallEndReason.Local -> "local"
            CallEndReason.Remote -> "remote"
            CallEndReason.Rejected -> "rejected"
            CallEndReason.Missed -> "missed"
            CallEndReason.ConnectionLost -> "connectionLost"
            is CallEndReason.Failed -> "failed"
        }

        /** iOS `VideoQualityLevel.rawValue`. */
        fun tierLabel(level: VideoQualityLevel): String = level.name.lowercase()

        private fun grades(reading: CallQualityReading): List<CallQualityGrade?> = listOf(
            CallQualityRows.grade(CallQualityMetric.PACKET_LOSS, reading.packetLossPercent),
            CallQualityRows.grade(CallQualityMetric.LATENCY, reading.roundTripTimeMs),
            CallQualityRows.grade(CallQualityMetric.JITTER, reading.jitterMs),
        )

        private fun sampleOf(reading: CallQualityReading) = CallNetworkSample(
            packetLossPercent = reading.packetLossPercent,
            roundTripTimeMs = reading.roundTripTimeMs,
            jitterMs = reading.jitterMs,
            audioKbps = reading.audioKbps,
            videoKbps = reading.videoKbps,
        )
    }
}
