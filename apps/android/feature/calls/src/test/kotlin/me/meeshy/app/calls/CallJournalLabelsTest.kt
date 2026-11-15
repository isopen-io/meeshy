package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallJournalLabelsTest {

    @Test
    fun `the accessibility label reads name, participants, direction, type, age and duration in that order`() {
        val label = CallJournalLabels.accessibility(
            name = "Équipe",
            participants = "Ana, Bo +2",
            direction = "Missed call",
            type = "Video call",
            age = "2 hours ago",
            duration = "Duration 1:05",
        )

        assertThat(label).isEqualTo("Équipe, Ana, Bo +2, Missed call, Video call, 2 hours ago, Duration 1:05")
    }

    @Test
    fun `absent parts are skipped instead of leaving empty separators`() {
        val label = CallJournalLabels.accessibility(
            name = "Ana",
            participants = null,
            direction = "Outgoing call",
            type = "Voice call",
            age = "",
            duration = null,
        )

        assertThat(label).isEqualTo("Ana, Outgoing call, Voice call")
    }
}
