package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Le demandeur apprend le refus de sa demande d'entrée sans relecture (#19949, miroir Android de
 * #19879) : `community:join-request-decided` patche le détail tenu, et `currentUserJoinRetryAt` dit
 * jusqu'à quand le détail lit « Demande refusée ». Mêmes cas que le web
 * (`community-join-request-decided.test.ts`, `membershipActionOf`).
 */
class CommunityJoinRequestDecidedTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val now = Instant.parse("2026-11-20T12:00:00Z")
    private val retryAt = "2026-11-27T11:00:00.000Z"

    private fun pending(role: String? = null) = ApiCommunity(
        id = "c1", createdBy = "owner", requiresJoinApproval = true, currentUserRole = role,
        currentUserJoinRequest = if (role == null) ApiCommunity.PENDING_JOIN_REQUEST else null,
    )

    private fun rejected(communityId: String = "c1", decision: String = "rejected", retry: String? = retryAt) =
        CommunityJoinRequestDecidedEvent(communityId = communityId, decision = decision, retryAt = retry, at = "2026-11-20T11:00:00.000Z")

    @Test
    fun `le detail servi se decode avec la date de la nouvelle demande`() {
        val decoded = json.decodeFromString(
            ApiCommunity.serializer(),
            """{"id":"c1","createdBy":"owner","requiresJoinApproval":true,"currentUserJoinRetryAt":"$retryAt"}""",
        )
        assertThat(decoded.joinDeclinedUntil(now)).isEqualTo(Instant.parse(retryAt))
    }

    @Test
    fun `la charge de l'evenement se decode, la personne qui a tranche n'y est pas`() {
        val decoded = json.decodeFromString(
            CommunityJoinRequestDecidedEvent.serializer(),
            """{"communityId":"c1","decision":"rejected","retryAt":"$retryAt","at":"2026-11-20T11:00:00.000Z","decidedBy":"u9"}""",
        )
        assertThat(decoded).isEqualTo(rejected())
    }

    @Test
    fun `un refus patche la demande en attente en demande refusee jusqu'a la date servie`() {
        val next = pending().applying(rejected())

        assertThat(next).isNotNull()
        assertThat(next!!.hasPendingJoinRequest).isFalse()
        assertThat(next.joinDeclinedUntil(now)).isEqualTo(Instant.parse(retryAt))
    }

    @Test
    fun `un refus d'une autre communaute ne touche pas la fiche`() {
        assertThat(pending().applying(rejected(communityId = "c2"))).isNull()
    }

    @Test
    fun `une decision inconnue ou une date illisible ne se lit pas`() {
        assertThat(pending().applying(rejected(decision = "accepted"))).isNull()
        assertThat(pending().applying(rejected(retry = "demain"))).isNull()
        assertThat(pending().applying(rejected(retry = null))).isNull()
        assertThat(pending().applying(rejected(communityId = ""))).isNull()
    }

    @Test
    fun `un lecteur deja entre par une autre porte n'est pas touche`() {
        assertThat(pending(role = "member").applying(rejected())).isNull()
    }

    @Test
    fun `la date passee rend la demande de nouveau possible`() {
        val declined = pending().applying(rejected())!!

        assertThat(declined.joinDeclinedUntil(Instant.parse("2026-11-27T11:00:00Z"))).isNull()
        assertThat(declined.joinDeclinedUntil(Instant.parse("2026-11-27T10:59:59Z"))).isNotNull()
    }

    @Test
    fun `une demande en attente ou un membre ne lisent jamais un refus`() {
        val servedBoth = pending().copy(currentUserJoinRetryAt = retryAt)
        val member = pending(role = "member").copy(currentUserJoinRetryAt = retryAt)

        assertThat(servedBoth.joinDeclinedUntil(now)).isNull()
        assertThat(member.joinDeclinedUntil(now)).isNull()
    }

    @Test
    fun `une date servie illisible vaut aucun refus`() {
        assertThat(pending().copy(currentUserJoinRequest = null, currentUserJoinRetryAt = "bientot").joinDeclinedUntil(now)).isNull()
    }

    @Test
    fun `entrer apres un refus efface la date`() {
        val declined = pending().applying(rejected())!!
        val change = CommunityMemberChange.of(CommunityMemberChange.Kind.JOINED, "c1", "me", 5, MemberRole.MEMBER)!!

        val entered = declined.copy(currentUserRole = null).applying(change, viewerId = "me")

        assertThat(entered?.currentUserJoinRetryAt).isNull()
    }
}
