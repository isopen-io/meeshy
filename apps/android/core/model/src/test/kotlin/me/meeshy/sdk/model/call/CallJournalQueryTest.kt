package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallJournalQueryTest {

    private fun record(
        peerName: String? = null,
        peerUsername: String? = null,
        title: String? = null,
        participants: List<CallHistoryParticipant> = emptyList(),
    ) = CallRecord(
        callId = "c1",
        conversationId = "conv",
        conversationType = "direct",
        conversationTitle = title,
        mode = "p2p",
        status = "ended",
        direction = "incoming",
        isVideo = false,
        startedAt = "2026-06-20T10:00:00Z",
        durationSec = 0,
        peer = peerUsername?.let { CallHistoryPeer(userId = "u", username = it, displayName = peerName) },
        participants = participants,
    )

    @Test
    fun `the default query is all x all with no search`() {
        assertThat(CallJournalQuery().isDefault).isTrue()
        assertThat(CallJournalQuery(filter = CallJournalFilter.MISSED).isDefault).isFalse()
        assertThat(CallJournalQuery(type = CallJournalType.VIDEO).isDefault).isFalse()
        assertThat(CallJournalQuery(search = "ana").isDefault).isFalse()
    }

    @Test
    fun `a blank search is still the default query`() {
        assertThat(CallJournalQuery(search = "   ").isDefault).isTrue()
        assertThat(CallJournalQuery(search = "   ").foldedSearch).isEmpty()
    }

    @Test
    fun `search folds case and diacritics`() {
        assertThat(CallJournalQuery(search = "  ÉLÉonore ").foldedSearch).isEqualTo("eleonore")
    }

    @Test
    fun `the cache key is stable and distinguishes filter type and search`() {
        assertThat(CallJournalQuery().cacheKey).isEqualTo("calls:list:all")
        assertThat(CallJournalQuery(filter = CallJournalFilter.MISSED).cacheKey).isEqualTo("calls:list:missed")
        assertThat(CallJournalQuery(type = CallJournalType.AUDIO).cacheKey).isEqualTo("calls:list:all:type=audio")
        assertThat(CallJournalQuery(CallJournalFilter.MISSED, CallJournalType.VIDEO, "Éa").cacheKey)
            .isEqualTo("calls:list:missed:type=video:q=ea")
    }

    @Test
    fun `two spellings of the same search share one cache key`() {
        assertThat(CallJournalQuery(search = "Zoé").cacheKey).isEqualTo(CallJournalQuery(search = " zoe").cacheKey)
    }

    @Test
    fun `the wire search is folded and capped at 100 characters`() {
        assertThat(CallJournalQuery(search = "Zoé").wireSearch).isEqualTo("zoe")
        assertThat(CallJournalQuery(search = "a".repeat(150)).wireSearch).hasLength(100)
        assertThat(CallJournalQuery().wireSearch).isNull()
    }

    @Test
    fun `wire type is omitted for all`() {
        assertThat(CallJournalQuery().wireType).isNull()
        assertThat(CallJournalQuery(type = CallJournalType.VIDEO).wireType).isEqualTo("video")
        assertThat(CallJournalQuery(filter = CallJournalFilter.MISSED).wireFilter).isEqualTo("missed")
    }

    @Test
    fun `matches accepts everything on a blank query`() {
        assertThat(record().matches("  ", "Inconnu")).isTrue()
    }

    @Test
    fun `matches the displayed name ignoring accents and case`() {
        assertThat(record(peerName = "Éléonore", peerUsername = "eleo").matches("ELEONORE", "Inconnu")).isTrue()
        assertThat(record(peerName = "Éléonore", peerUsername = "eleo").matches("marc", "Inconnu")).isFalse()
    }

    @Test
    fun `matches the peer username even when a display name is shown`() {
        assertThat(record(peerName = "Maman", peerUsername = "marie_d").matches("marie", "Inconnu")).isTrue()
    }

    @Test
    fun `matches the fallback name when nothing else is shown`() {
        assertThat(record().matches("inconnu", "Inconnu")).isTrue()
    }

    @Test
    fun `matches group participants by name or username`() {
        val group = record(
            title = "Équipe",
            participants = listOf(
                CallHistoryParticipant(participantId = "p1", username = "zed", displayName = "Zoé"),
            ),
        )
        assertThat(group.matches("zoe", "Inconnu")).isTrue()
        assertThat(group.matches("zed", "Inconnu")).isTrue()
        assertThat(group.matches("equipe", "Inconnu")).isTrue()
        assertThat(group.matches("nobody", "Inconnu")).isFalse()
    }

    @Test
    fun `local derivation applies filter type and search to a record list`() {
        val missedVideo = record(peerName = "Ana", peerUsername = "ana").copy(direction = "missed", isVideo = true)
        val answeredAudio = record(peerName = "Ana", peerUsername = "ana")
        val all = listOf(missedVideo, answeredAudio)

        assertThat(CallJournalQuery().apply(all, "?")).hasSize(2)
        assertThat(CallJournalQuery(filter = CallJournalFilter.MISSED).apply(all, "?")).containsExactly(missedVideo)
        assertThat(CallJournalQuery(type = CallJournalType.AUDIO).apply(all, "?")).containsExactly(answeredAudio)
        assertThat(CallJournalQuery(search = "bob").apply(all, "?")).isEmpty()
    }
}
