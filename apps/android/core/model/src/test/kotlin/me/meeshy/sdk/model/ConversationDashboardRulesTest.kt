package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationDashboardRulesTest {

    private fun response(total: Int) = ConversationMessageStatsResponse(conversationId = "c1", totalMessages = total)

    private fun share(index: Int) = ParticipantShare(
        userId = "u$index",
        name = "User $index",
        messageCount = 100 - index,
        wordCount = 0,
        fraction = 0.0,
    )

    @Test
    fun `server stats win over the client snapshot`() {
        val effective = ConversationDashboardRules.effectiveStats(response(500), response(20))

        assertThat(effective?.totalMessages).isEqualTo(500)
    }

    @Test
    fun `the client snapshot stands in until the server answers`() {
        assertThat(ConversationDashboardRules.effectiveStats(null, response(20))?.totalMessages).isEqualTo(20)
        assertThat(ConversationDashboardRules.effectiveStats(null, null)).isNull()
    }

    @Test
    fun `media max is the largest media count and never below one`() {
        assertThat(ConversationDashboardRules.mediaMax(ContentTypeCounts(image = 4, audio = 9, location = 2))).isEqualTo(9)
        assertThat(ConversationDashboardRules.mediaMax(ContentTypeCounts(text = 50))).isEqualTo(1)
    }

    @Test
    fun `every media ring is measured against the media max`() {
        val rings = ConversationDashboardRules.rings(40, 300, ContentTypeCounts(image = 5, audio = 10, video = 1, file = 2))

        assertThat(rings.map { it.kind }).containsExactly(
            DashboardRingKind.MESSAGES, DashboardRingKind.WORDS, DashboardRingKind.PHOTOS,
            DashboardRingKind.AUDIO, DashboardRingKind.VIDEOS, DashboardRingKind.LINKS, DashboardRingKind.DOCUMENTS,
        ).inOrder()
        assertThat(rings.first { it.kind == DashboardRingKind.PHOTOS }.progress).isWithin(1e-6f).of(0.5f)
        assertThat(rings.first { it.kind == DashboardRingKind.AUDIO }.progress).isWithin(1e-6f).of(1f)
        assertThat(rings.first { it.kind == DashboardRingKind.MESSAGES }.progress).isWithin(1e-6f).of(1f)
    }

    @Test
    fun `the documents ring is absent without files and an empty ring has no progress`() {
        val rings = ConversationDashboardRules.rings(0, 0, ContentTypeCounts())

        assertThat(rings.map { it.kind }).doesNotContain(DashboardRingKind.DOCUMENTS)
        assertThat(rings.all { it.progress == 0f }).isTrue()
    }

    @Test
    fun `the participant list is cut to the ten busiest`() {
        val top = ConversationDashboardRules.topParticipants((1..14).map(::share))

        assertThat(top).hasSize(10)
        assertThat(top.first().userId).isEqualTo("u1")
        assertThat(top.last().userId).isEqualTo("u10")
    }
}
