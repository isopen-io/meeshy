package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Le refus d'une demande d'entrée (#19949) : la charge de
 * `services/gateway/src/services/community-join-request-decided.ts` et la date servie par
 * `GET /communities/:id` (`currentUserJoinRetryAt`), lues et appliquées au détail tenu — mêmes règles
 * que le web (`community-join-request-live.ts`, `lib/communities/view.ts`).
 */
class CommunityJoinRequestDecidedEventTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val now = Instant.parse("2026-11-20T12:00:00Z")

    private fun pending(id: String = "c1") =
        ApiCommunity(id = id, name = "Com", requiresJoinApproval = true, currentUserJoinRequest = ApiCommunity.PENDING_JOIN_REQUEST)

    private fun rejected(communityId: String = "c1", retryAt: String = "2026-11-27T12:00:00.000Z", decision: String = "rejected") =
        CommunityJoinRequestDecidedEvent(communityId = communityId, decision = decision, retryAt = retryAt, at = "2026-11-20T12:00:00.000Z")

    @Test
    fun `la charge community join-request-decided se decode cle par cle`() {
        val decoded = json.decodeFromString(
            CommunityJoinRequestDecidedEvent.serializer(),
            """{"communityId":"c1","decision":"rejected","retryAt":"2026-11-27T12:00:00.000Z","at":"2026-11-20T12:00:00.000Z"}""",
        )

        assertThat(decoded.communityId).isEqualTo("c1")
        assertThat(decoded.decision).isEqualTo("rejected")
        assertThat(decoded.retryAt).isEqualTo("2026-11-27T12:00:00.000Z")
        assertThat(decoded.at).isEqualTo("2026-11-20T12:00:00.000Z")
        assertThat(decoded.refusedUntil).isEqualTo(Instant.parse("2026-11-27T12:00:00Z"))
    }

    @Test
    fun `le detail sert la date a partir de laquelle une nouvelle demande est possible`() {
        val decoded = json.decodeFromString(
            ApiCommunity.serializer(),
            """{"id":"c1","requiresJoinApproval":true,"currentUserJoinRequest":null,"currentUserJoinRetryAt":"2026-11-27T12:00:00.000Z"}""",
        )

        assertThat(decoded.currentUserJoinRetryAt).isEqualTo("2026-11-27T12:00:00.000Z")
        assertThat(decoded.joinDeclinedUntil(now)).isEqualTo(Instant.parse("2026-11-27T12:00:00Z"))
    }

    @Test
    fun `un ancien serveur sans la date ne dit aucun refus`() {
        val decoded = json.decodeFromString(ApiCommunity.serializer(), """{"id":"c1","requiresJoinApproval":true}""")

        assertThat(decoded.currentUserJoinRetryAt).isNull()
        assertThat(decoded.joinDeclinedUntil(now)).isNull()
    }

    @Test
    fun `une date passee ou illisible rend la demande de nouveau possible`() {
        assertThat(pending().copy(currentUserJoinRequest = null, currentUserJoinRetryAt = "2026-11-19T12:00:00.000Z").joinDeclinedUntil(now)).isNull()
        assertThat(pending().copy(currentUserJoinRequest = null, currentUserJoinRetryAt = "demain").joinDeclinedUntil(now)).isNull()
    }

    @Test
    fun `un membre ou une demande en attente ne lit jamais de refus`() {
        val future = "2026-11-27T12:00:00.000Z"
        assertThat(pending().copy(currentUserJoinRetryAt = future).joinDeclinedUntil(now)).isNull()
        assertThat(pending().copy(currentUserJoinRequest = null, currentUserRole = "member", currentUserJoinRetryAt = future).joinDeclinedUntil(now)).isNull()
    }

    @Test
    fun `le refus passe la demande envoyee a demande refusee sans relecture`() {
        val next = pending().applying(rejected())

        assertThat(next?.currentUserJoinRequest).isNull()
        assertThat(next?.currentUserJoinRetryAt).isEqualTo("2026-11-27T12:00:00.000Z")
        assertThat(next?.joinDeclinedUntil(now)).isEqualTo(Instant.parse("2026-11-27T12:00:00Z"))
    }

    @Test
    fun `un refus d une autre communaute ne touche pas la fiche`() {
        assertThat(pending().applying(rejected(communityId = "c2"))).isNull()
    }

    @Test
    fun `une decision inconnue ou une date illisible ne touche pas la fiche`() {
        assertThat(pending().applying(rejected(decision = "accepted"))).isNull()
        assertThat(pending().applying(rejected(retryAt = "bientot"))).isNull()
    }

    @Test
    fun `un lecteur deja entre par une autre porte garde son role`() {
        assertThat(pending().copy(currentUserRole = "member", currentUserJoinRequest = null).applying(rejected())).isNull()
    }
}
