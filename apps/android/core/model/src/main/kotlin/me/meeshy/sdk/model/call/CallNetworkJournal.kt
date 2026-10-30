package me.meeshy.sdk.model.call

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** One quality reading of a call's link, as this device measured it — port of iOS `CallNetworkSample` (#8698). */
@Serializable
data class CallNetworkSample(
    val packetLossPercent: Double,
    val roundTripTimeMs: Double,
    val jitterMs: Double,
    val audioKbps: Double,
    val videoKbps: Double,
)

/**
 * What happened on the link — port of iOS `CallNetworkEventKind`. The opaque labels ([Link.state], [Tier.level],
 * [Ended.reason], [MediaFault.reason]) are written by the recorder, which owns their vocabulary.
 */
@Serializable
sealed interface CallNetworkEventKind {
    @Serializable @SerialName("link")
    data class Link(val state: String) : CallNetworkEventKind

    @Serializable @SerialName("reconnecting")
    data class Reconnecting(val attempt: Int) : CallNetworkEventKind

    @Serializable @SerialName("reconnected")
    data object Reconnected : CallNetworkEventKind

    @Serializable @SerialName("route")
    data class Route(val relayed: Boolean) : CallNetworkEventKind

    @Serializable @SerialName("sample")
    data class Sample(val sample: CallNetworkSample) : CallNetworkEventKind

    @Serializable @SerialName("tier")
    data class Tier(val level: String) : CallNetworkEventKind

    @Serializable @SerialName("profile")
    data class Profile(val name: String) : CallNetworkEventKind

    @Serializable @SerialName("mediaFault")
    data class MediaFault(val reason: String) : CallNetworkEventKind

    @Serializable @SerialName("ended")
    data class Ended(val reason: String) : CallNetworkEventKind
}

@Serializable
data class CallNetworkEvent(val atMs: Long, val kind: CallNetworkEventKind)

/**
 * A call's network and quality journal, kept on THIS device only — port of iOS `CallNetworkJournal` (#8698).
 * Bounded: past [EVENT_CEILING], the oldest samples go first, so the milestones (reconnections, route changes,
 * faults) outlive the readings.
 */
@Serializable
data class CallNetworkJournal(
    val callId: String,
    val startedAtMs: Long,
    val events: List<CallNetworkEvent>,
) {
    fun appending(event: CallNetworkEvent): CallNetworkJournal = copy(events = bounded(events + event))

    /** [newer]'s events interleaved by instant (ties keep this journal's first), the earliest start kept. */
    fun merging(newer: CallNetworkJournal): CallNetworkJournal = copy(
        startedAtMs = minOf(startedAtMs, newer.startedAtMs),
        events = bounded((events + newer.events).sortedBy { it.atMs }),
    )

    val summary: CallNetworkSummary get() = CallNetworkSummary.of(events)

    companion object {
        const val EVENT_CEILING = 240

        fun bounded(events: List<CallNetworkEvent>): List<CallNetworkEvent> {
            if (events.size <= EVENT_CEILING) return events
            val overflow = events.size - EVENT_CEILING
            val dropped = events.indices.filter { events[it].kind is CallNetworkEventKind.Sample }.take(overflow).toSet()
            return events.filterIndexed { index, _ -> index !in dropped }.takeLast(EVENT_CEILING)
        }
    }
}

/** What the detail sheet says about a call's link in one glance — port of iOS `CallNetworkSummary`. */
data class CallNetworkSummary(
    val sampleCount: Int,
    val meanPacketLossPercent: Double,
    val peakPacketLossPercent: Double,
    val meanRoundTripTimeMs: Double,
    val peakRoundTripTimeMs: Double,
    val meanJitterMs: Double,
    val reconnectionCount: Int,
    /** Last route observed — `null` when no route was ever read. */
    val relayed: Boolean?,
    val faultCount: Int,
    /** Data profiles the call went through, in first-appearance order. */
    val profiles: List<String>,
) {
    companion object {
        fun of(events: List<CallNetworkEvent>): CallNetworkSummary {
            val kinds = events.map { it.kind }
            val samples = kinds.filterIsInstance<CallNetworkEventKind.Sample>().map { it.sample }
            fun mean(value: (CallNetworkSample) -> Double): Double =
                if (samples.isEmpty()) 0.0 else samples.sumOf(value) / samples.size
            return CallNetworkSummary(
                sampleCount = samples.size,
                meanPacketLossPercent = mean { it.packetLossPercent },
                peakPacketLossPercent = samples.maxOfOrNull { it.packetLossPercent } ?: 0.0,
                meanRoundTripTimeMs = mean { it.roundTripTimeMs },
                peakRoundTripTimeMs = samples.maxOfOrNull { it.roundTripTimeMs } ?: 0.0,
                meanJitterMs = mean { it.jitterMs },
                reconnectionCount = kinds.count { it == CallNetworkEventKind.Reconnected },
                relayed = kinds.filterIsInstance<CallNetworkEventKind.Route>().lastOrNull()?.relayed,
                faultCount = kinds.count { it is CallNetworkEventKind.MediaFault },
                profiles = kinds.filterIsInstance<CallNetworkEventKind.Profile>().map { it.name }.distinct(),
            )
        }
    }
}
