package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.presence.ViewingChange
import me.meeshy.sdk.model.presence.ViewingEvent
import me.meeshy.sdk.model.presence.ViewingSnapshot
import org.junit.Test

class SocketEventsViewingDecodeTest {

    @Test
    fun `start stop and activity decode to their registry events`() {
        val raw = """{"userId":"u1","conversationId":"c1","unknown":true}"""
        val change = ViewingChange("u1", "c1")
        assertThat(SocketEventsViewing.decode("viewing:start", raw)).isEqualTo(ViewingEvent.Arrived(change))
        assertThat(SocketEventsViewing.decode("viewing:stop", raw)).isEqualTo(ViewingEvent.Left(change))
        assertThat(SocketEventsViewing.decode("viewing:activity", raw)).isEqualTo(ViewingEvent.Active(change))
    }

    @Test
    fun `activity carries the focus flag`() {
        val raw = """{"userId":"u1","conversationId":"c1","focus":true}"""
        assertThat(SocketEventsViewing.decode("viewing:activity", raw))
            .isEqualTo(ViewingEvent.Active(ViewingChange("u1", "c1", focus = true)))
    }

    @Test
    fun `snapshot decodes the complete list of peers`() {
        assertThat(SocketEventsViewing.decode("viewing:snapshot", """{"conversationId":"c1","userIds":["a","b"]}"""))
            .isEqualTo(ViewingEvent.Snapshot(ViewingSnapshot("c1", listOf("a", "b"))))
    }

    @Test
    fun `an unreadable payload or a foreign event decodes to nothing`() {
        assertThat(SocketEventsViewing.decode("viewing:start", """{"conversationId":"c1"}""")).isNull()
        assertThat(SocketEventsViewing.decode("viewing:start", "not json")).isNull()
        assertThat(SocketEventsViewing.decode("typing:start", """{"userId":"u","conversationId":"c"}""")).isNull()
    }
}
