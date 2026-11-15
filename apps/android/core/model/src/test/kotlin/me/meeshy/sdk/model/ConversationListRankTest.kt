package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.preview.ConversationLastReaction
import org.junit.Test

class ConversationListRankTest {

    private fun conv(
        lastAt: String? = null,
        rank: String? = null,
        reactionAt: String? = null,
        reactionTarget: String? = null,
    ) = ApiConversation(
        id = "c",
        updatedAt = "2026-01-01T00:00:00Z",
        lastMessage = lastAt?.let { ApiConversationLastMessage(createdAt = it) },
        listRankAt = rank,
        lastReaction = reactionAt?.let {
            ConversationLastReaction(
                emoji = "x", reactorId = "r", reactorName = "R", messageId = "m",
                targetSenderUserId = reactionTarget, createdAt = it,
            )
        },
    )

    private val t1 = "2026-03-01T00:00:00Z"
    private val t2 = "2026-03-02T00:00:00Z"
    private val t3 = "2026-03-03T00:00:00Z"

    @Test
    fun `le rang servi remonte la ligne au dessus du dernier message`() {
        assertThat(conv(lastAt = t1, rank = t2).listRankAt("me")).isEqualTo(isoToEpochMillisOrNull(t2))
    }

    @Test
    fun `un rang servi plus ancien ne fait pas redescendre la ligne`() {
        assertThat(conv(lastAt = t2, rank = t1).listRankAt("me")).isEqualTo(isoToEpochMillisOrNull(t2))
    }

    @Test
    fun `une reaction a un message du lecteur remonte la ligne`() {
        assertThat(conv(lastAt = t1, reactionAt = t3, reactionTarget = "me").listRankAt("me"))
            .isEqualTo(isoToEpochMillisOrNull(t3))
    }

    @Test
    fun `une reaction a un message d un autre ne bouge pas la ligne`() {
        assertThat(conv(lastAt = t1, reactionAt = t3, reactionTarget = "other").listRankAt("me"))
            .isEqualTo(isoToEpochMillisOrNull(t1))
    }

    @Test
    fun `un lecteur inconnu ne s attribue aucune reaction`() {
        assertThat(conv(lastAt = t1, reactionAt = t3, reactionTarget = "me").listRankAt(null))
            .isEqualTo(isoToEpochMillisOrNull(t1))
    }

    @Test
    fun `sans message ni rang la ligne retombe sur updatedAt`() {
        assertThat(conv().listRankAt("me")).isEqualTo(isoToEpochMillisOrNull("2026-01-01T00:00:00Z"))
    }
}
