package me.meeshy.sdk.model.reading.summary

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import me.meeshy.sdk.model.PresenceState
import org.junit.Test

class SummaryEntryActionTest {
    private fun face(evidence: List<String>) = FaceRampEntry(
        "u1", "Bob", null, "#31B6BA", PresenceState.OFFLINE, evidence.size, 1.0, evidence,
    )

    private fun episode(ids: List<String>) = ConversationEpisode(
        "e1", Instant.EPOCH, Instant.EPOCH, ids, emptyList(), EpisodeTitle(DayLabel.Relative(DayLabelKey.TODAY), null, ids.size),
    )

    @Test fun `un visage designe sa premiere preuve`() {
        assertThat(SummaryEntryAction.target(face(listOf("m3", "m9")))).isEqualTo("m3")
        assertThat(SummaryEntryAction.target(face(emptyList()))).isNull()
    }

    @Test fun `un episode designe son premier message`() {
        assertThat(SummaryEntryAction.target(episode(listOf("a", "b")))).isEqualTo("a")
        assertThat(SummaryEntryAction.target(episode(emptyList()))).isNull()
    }

    @Test fun `repondre n'est offert que si la loi d'actions l'admet`() {
        assertThat(SummaryEntryAction.offered(true))
            .containsExactly(SummaryEntryAction.GO_TO_MESSAGE, SummaryEntryAction.REPLY).inOrder()
        assertThat(SummaryEntryAction.offered(false)).containsExactly(SummaryEntryAction.GO_TO_MESSAGE)
        assertThat(SummaryEntryAction.offered(null)).containsExactly(SummaryEntryAction.GO_TO_MESSAGE)
    }
}
