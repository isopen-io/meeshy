package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * The network journal of a call — port of iOS `CallNetworkJournal`, `CallNetworkJournalRecorder` and
 * `CallNetworkJournalPresentation` (#8698, #13676): what the device records, how it is bounded and what the call
 * detail says about it.
 */
class CallNetworkJournalTest {

    private fun reading(
        loss: Double = 0.0,
        rtt: Double = 50.0,
        jitter: Double = 5.0,
        relayed: Boolean? = null,
    ) = CallQualityReading(packetLossPercent = loss, roundTripTimeMs = rtt, jitterMs = jitter, audioKbps = 32.0, videoKbps = 0.0, relayed = relayed)

    private fun sample(loss: Double = 0.0, rtt: Double = 50.0, jitter: Double = 5.0) =
        CallNetworkEventKind.Sample(CallNetworkSample(loss, rtt, jitter, 32.0, 0.0))

    private fun record(vararg inputs: Pair<Long, CallNetworkJournalInput>): List<CallNetworkEvent> =
        inputs.fold(CallNetworkJournalRecorder.Idle to emptyList<CallNetworkEvent>()) { (recorder, events), (at, input) ->
            val step = recorder.reducing(input, at)
            step.recorder to events + step.events
        }.second

    private val call = 0L to CallNetworkJournalInput.Call("call-1")

    @Test
    fun `nothing is recorded before a call id is known`() {
        val events = record(1L to CallNetworkJournalInput.Link(CallNetworkLink.CONNECTED), 2L to CallNetworkJournalInput.Reading(reading()))

        assertThat(events).isEmpty()
    }

    @Test
    fun `a link change is recorded once, a repeated state is not`() {
        val events = record(
            call,
            1L to CallNetworkJournalInput.Link(CallNetworkLink.CONNECTED),
            2L to CallNetworkJournalInput.Link(CallNetworkLink.CONNECTED),
            3L to CallNetworkJournalInput.Link(CallNetworkLink.DISCONNECTED),
        )

        assertThat(events.map { it.kind }).containsExactly(
            CallNetworkEventKind.Link("connected"),
            CallNetworkEventKind.Link("disconnected"),
        ).inOrder()
    }

    @Test
    fun `a reconnection records the attempt then the recovery, a first connection records nothing`() {
        val events = record(
            call,
            1L to CallNetworkJournalInput.State(CallState.Connected),
            2L to CallNetworkJournalInput.State(CallState.Reconnecting(attempt = 1)),
            3L to CallNetworkJournalInput.State(CallState.Connected),
        )

        assertThat(events.map { it.kind }).containsExactly(
            CallNetworkEventKind.Reconnecting(1),
            CallNetworkEventKind.Reconnected,
        ).inOrder()
    }

    @Test
    fun `the end is recorded with its reason and closes the journal`() {
        val events = record(
            call,
            1L to CallNetworkJournalInput.State(CallState.Ended(CallEndReason.ConnectionLost)),
            2L to CallNetworkJournalInput.Link(CallNetworkLink.FAILED),
        )

        assertThat(events.map { it.kind }).containsExactly(CallNetworkEventKind.Ended("connectionLost"))
    }

    @Test
    fun `a stable link is sampled every fifteen seconds, a change of grade at once`() {
        val events = record(
            call,
            1_000L to CallNetworkJournalInput.Reading(reading()),
            6_000L to CallNetworkJournalInput.Reading(reading()),
            16_000L to CallNetworkJournalInput.Reading(reading()),
            17_000L to CallNetworkJournalInput.Reading(reading(loss = 6.0)),
        )

        assertThat(events.map { it.atMs }).containsExactly(1_000L, 16_000L, 17_000L).inOrder()
    }

    @Test
    fun `a route is recorded when it changes`() {
        val events = record(
            call,
            1L to CallNetworkJournalInput.Reading(reading(relayed = false)),
            2L to CallNetworkJournalInput.Reading(reading(relayed = false)),
            20_000L to CallNetworkJournalInput.Reading(reading(relayed = true)),
        )

        assertThat(events.map { it.kind }.filterIsInstance<CallNetworkEventKind.Route>())
            .containsExactly(CallNetworkEventKind.Route(false), CallNetworkEventKind.Route(true)).inOrder()
    }

    @Test
    fun `a new call starts a fresh recorder`() {
        val events = record(
            call,
            1L to CallNetworkJournalInput.State(CallState.Ended(CallEndReason.Local)),
            2L to CallNetworkJournalInput.Call("call-2"),
            3L to CallNetworkJournalInput.Tier(VideoQualityLevel.POOR),
        )

        assertThat(events.map { it.kind }).containsExactly(
            CallNetworkEventKind.Ended("local"),
            CallNetworkEventKind.Tier("poor"),
        ).inOrder()
    }

    @Test
    fun `past the ceiling the oldest samples go first and the milestones stay`() {
        val milestone = CallNetworkEvent(0L, CallNetworkEventKind.Reconnecting(1))
        val samples = (1..CallNetworkJournal.EVENT_CEILING).map { CallNetworkEvent(it.toLong(), sample()) }
        val journal = CallNetworkJournal("call-1", 0L, listOf(milestone) + samples)
            .appending(CallNetworkEvent(999L, CallNetworkEventKind.Reconnected))

        assertThat(journal.events).hasSize(CallNetworkJournal.EVENT_CEILING)
        assertThat(journal.events.first()).isEqualTo(milestone)
        assertThat(journal.events.last().kind).isEqualTo(CallNetworkEventKind.Reconnected)
        assertThat(journal.events.map { it.atMs }).doesNotContain(1L)
    }

    @Test
    fun `merging interleaves by instant and keeps the earliest start`() {
        val persisted = CallNetworkJournal("call-1", 10L, listOf(CallNetworkEvent(10L, CallNetworkEventKind.Link("connected"))))
        val live = CallNetworkJournal("call-1", 20L, listOf(CallNetworkEvent(5L, CallNetworkEventKind.Reconnected)))

        val merged = persisted.merging(live)

        assertThat(merged.startedAtMs).isEqualTo(10L)
        assertThat(merged.events.map { it.atMs }).containsExactly(5L, 10L).inOrder()
    }

    @Test
    fun `the summary averages the samples, keeps peaks, the last route and distinct profiles`() {
        val events = listOf(
            sample(loss = 2.0, rtt = 100.0, jitter = 10.0),
            sample(loss = 4.0, rtt = 300.0, jitter = 20.0),
            CallNetworkEventKind.Reconnected,
            CallNetworkEventKind.Route(false),
            CallNetworkEventKind.Route(true),
            CallNetworkEventKind.Profile("eco"),
            CallNetworkEventKind.Profile("eco"),
            CallNetworkEventKind.MediaFault("camera"),
        ).mapIndexed { index, kind -> CallNetworkEvent(index.toLong(), kind) }

        val summary = CallNetworkSummary.of(events)

        assertThat(summary).isEqualTo(
            CallNetworkSummary(
                sampleCount = 2,
                meanPacketLossPercent = 3.0,
                peakPacketLossPercent = 4.0,
                meanRoundTripTimeMs = 200.0,
                peakRoundTripTimeMs = 300.0,
                meanJitterMs = 15.0,
                reconnectionCount = 1,
                relayed = true,
                faultCount = 1,
                profiles = listOf("eco"),
            ),
        )
    }

    @Test
    fun `a journal survives its round trip through JSON`() {
        val journal = CallNetworkJournal(
            "call-1",
            1L,
            listOf(CallNetworkEvent(2L, sample(loss = 1.0)), CallNetworkEvent(3L, CallNetworkEventKind.Reconnected)),
        )

        val decoded = Json.decodeFromString(CallNetworkJournal.serializer(), Json.encodeToString(CallNetworkJournal.serializer(), journal))

        assertThat(decoded).isEqualTo(journal)
    }

    @Test
    fun `a call whose only event is its end has nothing to show`() {
        val journal = CallNetworkJournal("call-1", 0L, listOf(CallNetworkEvent(0L, CallNetworkEventKind.Ended("missed"))))

        assertThat(CallNetworkJournalPresentation.of(journal).isEmpty).isTrue()
    }

    @Test
    fun `the presentation summarises measured calls and lists milestones without samples`() {
        val journal = CallNetworkJournal(
            "call-1",
            1_000L,
            listOf(
                CallNetworkEvent(1_000L, CallNetworkEventKind.Link("connected")),
                CallNetworkEvent(6_000L, sample(loss = 1.0)),
                CallNetworkEvent(66_000L, CallNetworkEventKind.Reconnecting(2)),
                CallNetworkEvent(70_000L, CallNetworkEventKind.Tier("critical")),
                CallNetworkEvent(71_000L, CallNetworkEventKind.MediaFault("capture: denied")),
            ),
        )

        val presentation = CallNetworkJournalPresentation.of(journal)

        assertThat(presentation.isEmpty).isFalse()
        assertThat(presentation.summary.map { it::class }).containsExactly(
            CallNetworkSummaryRow.PacketLoss::class,
            CallNetworkSummaryRow.Latency::class,
            CallNetworkSummaryRow.Jitter::class,
            CallNetworkSummaryRow.Reconnections::class,
            CallNetworkSummaryRow.Faults::class,
        ).inOrder()
        assertThat(presentation.timeline).containsExactly(
            CallNetworkMoment(0, "00:00", CallNetworkMomentKind.Link(CallNetworkLink.CONNECTED), null, false),
            CallNetworkMoment(2, "01:05", CallNetworkMomentKind.Reconnecting(2), null, true),
            CallNetworkMoment(3, "01:09", CallNetworkMomentKind.Tier(VideoQualityLevel.POOR), null, true),
            CallNetworkMoment(4, "01:10", CallNetworkMomentKind.MediaFault, "capture: denied", true),
        ).inOrder()
    }

    @Test
    fun `an unmeasured call shows its reconnections only`() {
        val journal = CallNetworkJournal("call-1", 0L, listOf(CallNetworkEvent(0L, CallNetworkEventKind.Link("connecting"))))

        assertThat(CallNetworkJournalPresentation.of(journal).summary).containsExactly(CallNetworkSummaryRow.Reconnections(0))
    }
}
