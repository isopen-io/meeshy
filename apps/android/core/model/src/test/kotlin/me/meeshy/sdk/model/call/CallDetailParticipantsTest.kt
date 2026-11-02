package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The « Participants » section of the call detail — port of iOS
 * `CallDetailSheet.participantsSection` (#8066): who joined a group call, reader
 * excluded, in join order, a name and a face — never a presence.
 */
class CallDetailParticipantsTest {

    private fun record(participants: List<CallHistoryParticipant>) = CallRecord(
        callId = "call-1",
        conversationId = "conv-1",
        conversationType = "group",
        mode = "sfu",
        status = "ended",
        direction = "outgoing",
        isVideo = false,
        startedAt = "2026-10-29T10:00:00.000Z",
        durationSec = 60,
        participants = participants,
    )

    private fun participant(
        participantId: String = "p1",
        displayName: String = "Ada",
        username: String? = null,
        avatar: String? = null,
    ) = CallHistoryParticipant(participantId = participantId, displayName = displayName, username = username, avatar = avatar)

    @Test
    fun `a call without participants has no section`() {
        assertThat(CallDetailParticipants.of(record(emptyList()), fallbackName = "Participant")).isEmpty()
    }

    @Test
    fun `participants keep the served join order with their name and avatar`() {
        val rows = CallDetailParticipants.of(
            record(
                listOf(
                    participant(participantId = "p2", displayName = "Zoé", avatar = "https://cdn/z.png"),
                    participant(participantId = "p1", displayName = "Ada"),
                ),
            ),
            fallbackName = "Participant",
        )

        assertThat(rows).containsExactly(
            CallDetailParticipantRow(name = "Zoé", avatarUrl = "https://cdn/z.png"),
            CallDetailParticipantRow(name = "Ada", avatarUrl = null),
        ).inOrder()
    }

    @Test
    fun `a blank display name falls back to the username, then to the localised fallback`() {
        val rows = CallDetailParticipants.of(
            record(
                listOf(
                    participant(participantId = "p1", displayName = "  ", username = "ada_l"),
                    participant(participantId = "p2", displayName = "", username = " "),
                ),
            ),
            fallbackName = "Participant",
        )

        assertThat(rows.map { it.name }).containsExactly("ada_l", "Participant").inOrder()
    }

    @Test
    fun `a blank avatar is no avatar`() {
        val rows = CallDetailParticipants.of(record(listOf(participant(avatar = " "))), fallbackName = "Participant")

        assertThat(rows.single().avatarUrl).isNull()
    }
}
