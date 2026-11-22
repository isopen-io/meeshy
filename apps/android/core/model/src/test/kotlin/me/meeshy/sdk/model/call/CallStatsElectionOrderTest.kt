package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #20121 — `RTCStatsReport` est une table : l'ordre de ses entrées n'a aucun sens.
 * Un même relevé, lu dans n'importe quel ordre, élit la même paire et en tire le
 * même RTT, le même débit sortant disponible et la même route (miroir iOS
 * `CallStatsElectionOrderTests`).
 */
class CallStatsElectionOrderTest {

    private fun candidate(id: String, type: String, local: Boolean = true) =
        CallStats.RawEntry(id, if (local) "local-candidate" else "remote-candidate", strings = mapOf("candidateType" to type))

    private fun pair(
        id: String,
        local: String,
        remote: String,
        priority: Double? = null,
        nominated: Boolean = true,
        state: String = "succeeded",
        rttSeconds: Double? = null,
        bitrate: Double? = null,
    ) = CallStats.RawEntry(
        id = id,
        type = "candidate-pair",
        values = buildMap {
            put("nominated", if (nominated) 1.0 else 0.0)
            priority?.let { put("priority", it) }
            rttSeconds?.let { put("currentRoundTripTime", it) }
            bitrate?.let { put("availableOutgoingBitrate", it) }
        },
        strings = mapOf("state" to state, "localCandidateId" to local, "remoteCandidateId" to remote),
    )

    private fun transport(id: String, selecting: String) =
        CallStats.RawEntry(id, "transport", strings = mapOf("selectedCandidatePairId" to selecting))

    private fun <T> orders(entries: List<T>): List<List<T>> {
        val rotations = { list: List<T> -> list.indices.map { list.drop(it) + list.take(it) } }
        return rotations(entries) + rotations(entries.reversed())
    }

    private data class Reading(val pairId: String?, val rttMs: Double, val bitrate: Int, val relayed: Boolean?)

    private fun read(entries: List<CallStats.RawEntry>): Reading {
        val stats = CallStats.reduce(entries)
        return Reading(CallStats.selectedCandidatePair(entries)?.id, stats.roundTripTimeMs, stats.availableOutgoingBitrateBps, stats.relayed)
    }

    private val twoTransportsReport = listOf(
        transport("T02", selecting = "CP1"),
        transport("T01", selecting = "CP2"),
        pair("CP1", "L1", "R1", priority = 200.0, rttSeconds = 0.05, bitrate = 2_000_000.0),
        pair("CP2", "L2", "R2", priority = 100.0, bitrate = 800_000.0),
        pair("CP3", "L3", "R3", priority = 50.0, nominated = false, state = "in-progress", rttSeconds = 0.3),
        candidate("L1", "relay"), candidate("R1", "relay", local = false),
        candidate("L2", "host"), candidate("R2", "srflx", local = false),
    )

    private val twoNominatedReport = listOf(
        pair("CP1", "L1", "R1", priority = 100.0, rttSeconds = 0.2, bitrate = 300_000.0),
        pair("CP2", "L2", "R2", priority = 300.0, rttSeconds = 0.04, bitrate = 1_500_000.0),
        pair("CP3", "L3", "R3", priority = 500.0, nominated = false, state = "in-progress", rttSeconds = 0.9, bitrate = 50_000.0),
        candidate("L1", "relay"), candidate("R1", "srflx", local = false),
        candidate("L2", "host"), candidate("R2", "host", local = false),
    )

    private val noElectedReport = listOf(
        pair("CP2", "L2", "R2", nominated = false, state = "in-progress", rttSeconds = 0.12, bitrate = 900_000.0),
        pair("CP1", "L1", "R1", nominated = false, state = "in-progress", rttSeconds = 0.05),
        pair("CP0", "L0", "R0", priority = 10.0, nominated = false, state = "waiting"),
    )

    @Test
    fun `deux transports élisent la paire du plus petit id de transport, dans tous les ordres`() {
        val readings = orders(twoTransportsReport).map(::read).toSet()
        assertThat(readings).containsExactly(Reading("CP2", 50.0, 800_000, false))
    }

    @Test
    fun `deux paires nominées élisent la plus forte priorité, dans tous les ordres`() {
        val readings = orders(twoNominatedReport).map(::read).toSet()
        assertThat(readings).containsExactly(Reading("CP2", 40.0, 1_500_000, false))
    }

    @Test
    fun `sans paire élue le RTT se lit sur la paire de plus forte priorité puis de plus petit id, et aucun débit sortant`() {
        val readings = orders(noElectedReport).map(::read).toSet()
        assertThat(readings).containsExactly(Reading(null, 50.0, 0, null))
    }

    @Test
    fun `le débit sortant ne se lit QUE sur la paire élue, dans tous les ordres (#20284)`() {
        val report = listOf(
            transport("T01", selecting = "CP1"),
            pair("CP1", "L1", "R1", priority = 10.0, rttSeconds = 0.05),
            pair("CP2", "L2", "R2", priority = 500.0, rttSeconds = 0.3, bitrate = 120_000.0),
            candidate("L1", "host"), candidate("R1", "host", local = false),
        )
        val readings = orders(report).map(::read).toSet()
        assertThat(readings).containsExactly(Reading("CP1", 50.0, 0, false))
    }

    @Test
    fun `à priorité égale deux paires nominées se départagent par le plus petit id`() {
        val report = listOf(
            pair("CPb", "L2", "R2", priority = 7.0, rttSeconds = 0.08),
            pair("CPa", "L1", "R1", priority = 7.0, rttSeconds = 0.02),
        )
        val ids = orders(report).map { CallStats.selectedCandidatePair(it)?.id }.toSet()
        assertThat(ids).containsExactly("CPa")
    }

    @Test
    fun `un transport qui nomme une paire absente cède au transport suivant qui en nomme une`() {
        val report = listOf(
            transport("T01", selecting = "ghost"),
            transport("T02", selecting = "CP2"),
            pair("CP1", "L1", "R1", priority = 900.0, rttSeconds = 0.3),
            pair("CP2", "L2", "R2", priority = 1.0, nominated = false, state = "in-progress", rttSeconds = 0.01),
        )
        val ids = orders(report).map { CallStats.selectedCandidatePair(it)?.id }.toSet()
        assertThat(ids).containsExactly("CP2")
    }
}
