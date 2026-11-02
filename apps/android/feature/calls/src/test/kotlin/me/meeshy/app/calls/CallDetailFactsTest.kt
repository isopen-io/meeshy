package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import java.util.Locale
import me.meeshy.app.calls.CallDetailFact.Kind
import me.meeshy.sdk.model.call.CallHistoryPeer
import me.meeshy.sdk.model.call.CallRecord
import org.junit.Test

class CallDetailFactsTest {

    private fun record(
        startedAt: String = "2026-07-01T10:00:00Z",
        durationSec: Int = 0,
        bytesSent: Long? = null,
        phone: String? = null,
    ) = CallRecord(
        callId = "c1",
        conversationId = "conv1",
        conversationType = "direct",
        mode = "p2p",
        status = "ended",
        direction = "outgoing",
        isVideo = true,
        startedAt = startedAt,
        durationSec = durationSec,
        bytesSent = bytesSent,
        peer = CallHistoryPeer(userId = "u1", username = "alice", phoneNumber = phone),
    )

    private fun facts(r: CallRecord) = CallDetailFacts.of(r, ZoneId.of("UTC"), Locale.ENGLISH)

    @Test
    fun `a missed call without counters shows only its type and date`() {
        assertThat(facts(record()).map { it.kind }).containsExactly(Kind.TYPE, Kind.DATE).inOrder()
    }

    @Test
    fun `a full record lists type, date, duration, data and number in order`() {
        val f = facts(record(durationSec = 125, bytesSent = 2048, phone = "+33612345678"))

        assertThat(f.map { it.kind }).containsExactly(Kind.TYPE, Kind.DATE, Kind.DURATION, Kind.DATA, Kind.PHONE).inOrder()
        assertThat(f.first { it.kind == Kind.DURATION }.value).isEqualTo("02:05")
        assertThat(f.first { it.kind == Kind.DATA }.value).isEqualTo("2.0 KB")
        assertThat(f.first { it.kind == Kind.PHONE }.value).isEqualTo("+33612345678")
    }

    @Test
    fun `the date is localised and an unparsable one drops its line`() {
        assertThat(facts(record()).first { it.kind == Kind.DATE }.value).contains("2026")
        assertThat(facts(record(startedAt = "nope")).map { it.kind }).containsExactly(Kind.TYPE)
    }
}
