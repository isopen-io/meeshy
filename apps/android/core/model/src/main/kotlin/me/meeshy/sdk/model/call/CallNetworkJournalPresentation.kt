package me.meeshy.sdk.model.call

/** One line of the summary of « Qualité et réseau », in display order; the screen localises title and value. */
sealed interface CallNetworkSummaryRow {
    data class PacketLoss(val meanPercent: Double, val peakPercent: Double) : CallNetworkSummaryRow
    data class Latency(val meanMs: Double, val peakMs: Double) : CallNetworkSummaryRow
    data class Jitter(val meanMs: Double) : CallNetworkSummaryRow
    data class Reconnections(val count: Int) : CallNetworkSummaryRow
    data class Route(val relayed: Boolean) : CallNetworkSummaryRow
    data class Profiles(val names: List<String>) : CallNetworkSummaryRow
    data class Faults(val count: Int) : CallNetworkSummaryRow
}

/** What a moment of the timeline says; the screen localises it. */
sealed interface CallNetworkMomentKind {
    data class Link(val link: CallNetworkLink) : CallNetworkMomentKind
    data class Reconnecting(val attempt: Int) : CallNetworkMomentKind
    data object Reconnected : CallNetworkMomentKind
    data class Route(val relayed: Boolean) : CallNetworkMomentKind

    /** [level] is the tier as the timeline names it: `CRITICAL` reads « Faible » like `POOR`, as on iOS. */
    data class Tier(val level: VideoQualityLevel) : CallNetworkMomentKind
    data class Profile(val name: String) : CallNetworkMomentKind
    data object MediaFault : CallNetworkMomentKind
    data object Ended : CallNetworkMomentKind
}

data class CallNetworkMoment(
    val index: Int,
    val elapsedLabel: String,
    val kind: CallNetworkMomentKind,
    val detail: String?,
    val isAlert: Boolean,
)

/**
 * What the call detail says about a call's link — port of iOS `CallNetworkJournalPresentation` (#8698): a summary
 * (averages, peaks, reconnections, route, profiles, faults) and the timeline of its milestones. Samples feed the
 * summary and never crowd the timeline. A call whose link was never observed (missed, declined) has nothing to say —
 * its only event is its end — and the section is then hidden ([isEmpty]).
 */
data class CallNetworkJournalPresentation(
    val summary: List<CallNetworkSummaryRow>,
    val timeline: List<CallNetworkMoment>,
    val isEmpty: Boolean,
) {
    companion object {
        fun of(journal: CallNetworkJournal): CallNetworkJournalPresentation = CallNetworkJournalPresentation(
            summary = summaryRows(journal.summary),
            timeline = journal.events.mapIndexedNotNull { index, event -> moment(index, event, journal.startedAtMs) },
            isEmpty = journal.events.all { it.kind is CallNetworkEventKind.Ended },
        )

        private fun summaryRows(summary: CallNetworkSummary): List<CallNetworkSummaryRow> {
            val measured = summary.sampleCount > 0
            return listOfNotNull(
                CallNetworkSummaryRow.PacketLoss(summary.meanPacketLossPercent, summary.peakPacketLossPercent).takeIf { measured },
                CallNetworkSummaryRow.Latency(summary.meanRoundTripTimeMs, summary.peakRoundTripTimeMs).takeIf { measured },
                CallNetworkSummaryRow.Jitter(summary.meanJitterMs).takeIf { measured },
                CallNetworkSummaryRow.Reconnections(summary.reconnectionCount),
                summary.relayed?.let(CallNetworkSummaryRow::Route),
                summary.profiles.takeIf { it.isNotEmpty() }?.let(CallNetworkSummaryRow::Profiles),
                CallNetworkSummaryRow.Faults(summary.faultCount).takeIf { summary.faultCount > 0 },
            )
        }

        private fun moment(index: Int, event: CallNetworkEvent, startedAtMs: Long): CallNetworkMoment? {
            val kind = event.kind
            val described: CallNetworkMomentKind = when (kind) {
                is CallNetworkEventKind.Sample -> return null
                is CallNetworkEventKind.Link -> CallNetworkMomentKind.Link(CallNetworkLink.fromLabel(kind.state) ?: return null)
                is CallNetworkEventKind.Reconnecting -> CallNetworkMomentKind.Reconnecting(kind.attempt)
                CallNetworkEventKind.Reconnected -> CallNetworkMomentKind.Reconnected
                is CallNetworkEventKind.Route -> CallNetworkMomentKind.Route(kind.relayed)
                is CallNetworkEventKind.Tier -> CallNetworkMomentKind.Tier(tierOf(kind.level))
                is CallNetworkEventKind.Profile -> CallNetworkMomentKind.Profile(kind.name)
                is CallNetworkEventKind.MediaFault -> CallNetworkMomentKind.MediaFault
                is CallNetworkEventKind.Ended -> CallNetworkMomentKind.Ended
            }
            return CallNetworkMoment(
                index = index,
                elapsedLabel = CallDuration.clock(maxOf(0L, event.atMs - startedAtMs) / MILLIS_PER_SECOND),
                kind = described,
                detail = (kind as? CallNetworkEventKind.MediaFault)?.reason,
                isAlert = isAlert(kind),
            )
        }

        private fun isAlert(kind: CallNetworkEventKind): Boolean = when (kind) {
            is CallNetworkEventKind.Reconnecting, is CallNetworkEventKind.MediaFault -> true
            is CallNetworkEventKind.Link -> kind.state == CallNetworkLink.DISCONNECTED.label || kind.state == CallNetworkLink.FAILED.label
            is CallNetworkEventKind.Tier -> kind.level == "poor" || kind.level == "critical"
            else -> false
        }

        private fun tierOf(label: String): VideoQualityLevel = when (label) {
            "excellent" -> VideoQualityLevel.EXCELLENT
            "good" -> VideoQualityLevel.GOOD
            "fair" -> VideoQualityLevel.FAIR
            else -> VideoQualityLevel.POOR
        }

        private const val MILLIS_PER_SECOND = 1_000L
    }
}
