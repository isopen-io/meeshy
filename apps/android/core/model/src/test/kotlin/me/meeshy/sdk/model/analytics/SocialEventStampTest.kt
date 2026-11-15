package me.meeshy.sdk.model.analytics

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SocialEventStampTest {

    private fun session(id: String = "s-1", startedAt: Long = 1_000L, dwellMs: Int = 500) = EngagementSession(
        sessionId = id, userId = "u", postId = "p", contentType = EngagementSession.ContentType.POST,
        surface = EngagementSession.Surface.detail, startedAt = startedAt, dwellMs = dwellMs, consent = "granted",
    )

    @Test
    fun `chaque enveloppe neuve a un UUID v4 minuscule unique`() {
        val ids = (1..50).map { SocialEventStamp.minted(1L).eventId }
        assertThat(ids.toSet()).hasSize(50)
        ids.forEach {
            assertThat(it).matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
        }
    }

    @Test
    fun `stableEventId est deterministe et distingue les cles`() {
        assertThat(SocialEventStamp.stableEventId("session-a")).isEqualTo(SocialEventStamp.stableEventId("session-a"))
        assertThat(SocialEventStamp.stableEventId("session-a")).isNotEqualTo(SocialEventStamp.stableEventId("session-b"))
        assertThat(SocialEventStamp.stableEventId("session-a"))
            .matches("[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
    }

    @Test
    fun `stableEventId garde un UUID tel quel en minuscules et lit un cmid`() {
        val uuid = "3F2504E0-4F89-41D3-9A0C-0305E82C3301"
        assertThat(SocialEventStamp.stableEventId(uuid)).isEqualTo(uuid.lowercase())
        assertThat(SocialEventStamp.stableEventId("cmid_$uuid")).isEqualTo(uuid.lowercase())
    }

    @Test
    fun `stableEventId rend le SHA-256 de reference de l'iOS`() {
        // sha256("a") = ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb
        assertThat(SocialEventStamp.stableEventId("a")).isEqualTo("ca978112-ca1b-5dca-bac2-31b39a23dc4d")
    }

    @Test
    fun `la session date son enveloppe a sa fin et le premier contact a son debut`() {
        val s = session(dwellMs = 2_500)
        assertThat(SocialEventStamp.of(s).occurredAtMs).isEqualTo(3_500L)
        assertThat(SocialEventStamp.startOf(s).occurredAtMs).isEqualTo(1_000L)
        assertThat(SocialEventStamp.startOf(s).eventId).isNotEqualTo(SocialEventStamp.of(s).eventId)
        assertThat(SocialEventStamp.of(session(dwellMs = -9)).occurredAtMs).isEqualTo(1_000L)
    }

    @Test
    fun `une session relue garde le meme identifiant`() {
        val first = StampedSocialEvent.stamping(SocialEvent.Dwell(session()), 99L)
        val again = StampedSocialEvent.stamping(SocialEvent.Dwell(session()), 12345L)
        assertThat(again.stamp).isEqualTo(first.stamp)
    }

    @Test
    fun `l'horodatage ISO est en UTC avec trois chiffres de millisecondes`() {
        assertThat(IsoUtc.format(1_757_928_863_563L)).isEqualTo("2025-09-15T09:34:23.563Z")
        assertThat(IsoUtc.parse("2025-09-15T09:34:23Z")).isEqualTo(1_757_928_863_000L)
    }
}
