package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Le détail d'une communauté ne sert plus `members[]` : le rôle du lecteur arrive en `currentUserRole`
 * (#6378), et c'est lui qui décide Rejoindre ou Quitter (#16602) ; une communauté qui valide chaque
 * entrée dit « Demande envoyée » (#19870). Miroir des témoins iOS de #16601 et #19903.
 */
class CommunityServedRoleTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    private fun served(role: String?, createdBy: String = "owner", request: String? = null) = ApiCommunity(
        id = "c1", createdBy = createdBy, currentUserRole = role, requiresJoinApproval = true, currentUserJoinRequest = request,
    )

    @Test
    fun `le detail servi se decode avec le role, la validation des entrees et la demande du lecteur`() {
        val decoded = json.decodeFromString(
            ApiCommunity.serializer(),
            """{"id":"c1","name":"Club","createdBy":"owner","currentUserRole":"moderator","requiresJoinApproval":true,"currentUserJoinRequest":"pending"}""",
        )
        assertThat(decoded.currentUserRole).isEqualTo("moderator")
        assertThat(decoded.requiresJoinApproval).isTrue()
        assertThat(decoded.hasPendingJoinRequest).isTrue()
    }

    @Test
    fun `un membre servi sans liste de membres est membre et peut quitter`() {
        val access = CommunityAccess.of(served("member"), "me")
        assertThat(access.isMember).isTrue()
        assertThat(access.canLeave).isTrue()
        assertThat(access.canJoin).isFalse()
    }

    @Test
    fun `un moderateur servi invite dans une communaute privee`() {
        val access = CommunityAccess.of(served("moderator").copy(isPrivate = true), "me")
        assertThat(access.membership.role).isEqualTo(MemberRole.MODERATOR)
        assertThat(access.canInvite).isTrue()
        assertThat(access.canManageMembers).isFalse()
    }

    @Test
    fun `le createur sans ligne reste admin et ne quitte pas`() {
        val access = CommunityAccess.of(served("admin", createdBy = "me"), "me")
        assertThat(access.isCreator).isTrue()
        assertThat(access.isAdmin).isTrue()
        assertThat(access.canLeave).isFalse()
        assertThat(CommunityAccess.of(served(null, createdBy = "me"), "me").isAdmin).isTrue()
    }

    @Test
    fun `un role nul servi laisse un non-membre rejoindre`() {
        val access = CommunityAccess.of(served(null), "me")
        assertThat(access.isMember).isFalse()
        assertThat(access.canJoin).isTrue()
    }

    @Test
    fun `le role servi prime sur une ligne ancienne de la liste`() {
        val community = served("admin").copy(members = listOf(ApiCommunityMember(id = "m", userId = "me", role = "member")))
        assertThat(CommunityAccess.of(community, "me").canManageMembers).isTrue()
    }

    @Test
    fun `un ancien serveur sans role servi se lit encore par la liste`() {
        val community = served(null).copy(members = listOf(ApiCommunityMember(id = "m", userId = "me", role = "admin")))
        assertThat(CommunityAccess.of(community, "me").canManageMembers).isTrue()
    }

    @Test
    fun `le lecteur servi qui part perd son role et ses droits`() {
        val next = served("member").copy(memberCount = 3)
            .applying(CommunityMemberChange(CommunityMemberChange.Kind.LEFT, "c1", "me", 2, null), viewerId = "me")!!
        assertThat(next.currentUserRole).isNull()
        assertThat(CommunityAccess.of(next, "me").isMember).isFalse()
    }

    @Test
    fun `le lecteur servi promu suit son nouveau role`() {
        val next = served("member")
            .applying(CommunityMemberChange(CommunityMemberChange.Kind.ROLE_UPDATED, "c1", "me", 2, MemberRole.ADMIN), viewerId = "me")!!
        assertThat(CommunityAccess.of(next, "me").canManageMembers).isTrue()
    }

    @Test
    fun `le lecteur accepte entre et sa demande n attend plus`() {
        val next = served(null, request = "pending")
            .applying(CommunityMemberChange(CommunityMemberChange.Kind.JOINED, "c1", "me", 2, MemberRole.MEMBER), viewerId = "me")!!
        assertThat(next.hasPendingJoinRequest).isFalse()
        assertThat(CommunityAccess.of(next, "me").isMember).isTrue()
    }

    @Test
    fun `l entree d un tiers ne touche ni le role ni la demande du lecteur`() {
        val next = served(null, request = "pending")
            .applying(CommunityMemberChange(CommunityMemberChange.Kind.JOINED, "c1", "u3", 2, MemberRole.MEMBER), viewerId = "me")
        assertThat(next?.currentUserRole).isNull()
        assertThat(next?.hasPendingJoinRequest ?: true).isTrue()
    }

    @Test
    fun `la reponse 202 est une demande, pas une adhesion`() {
        val outcome = json.decodeFromString(CommunityJoinOutcome.serializer(), """{"status":"pending","requestId":"r1"}""")
        assertThat(outcome).isEqualTo(CommunityJoinOutcome.Pending("r1"))
    }

    @Test
    fun `une ligne de membre qui porte un status reste une adhesion`() {
        val outcome = json.decodeFromString(
            CommunityJoinOutcome.serializer(),
            """{"id":"m1","communityId":"c1","userId":"me","role":"member","status":"pending"}""",
        )
        assertThat(outcome).isEqualTo(CommunityJoinOutcome.Joined(ApiCommunityMember(id = "m1", communityId = "c1", userId = "me", role = "member")))
    }

    @Test
    fun `l enveloppe de la passerelle se lit avec la demande`() {
        val response = json.decodeFromString(
            ApiResponse.serializer(CommunityJoinOutcome.serializer()),
            """{"success":true,"data":{"status":"pending","requestId":"r1"}}""",
        )
        assertThat(response.data).isEqualTo(CommunityJoinOutcome.Pending("r1"))
    }

    @Test
    fun `le corps de la jonction annonce la demande en attente`() {
        assertThat(json.encodeToString(JoinCommunityRequest.serializer(), JoinCommunityRequest())).isEqualTo("""{"acceptsPending":true}""")
    }

    @Test
    fun `seul le code du delai apres refus se dit au lecteur`() {
        assertThat(CommunityJoinRefusal.of("COMMUNITY_JOIN_COOLDOWN")).isEqualTo(CommunityJoinRefusal.COOLDOWN)
        assertThat(CommunityJoinRefusal.of("COMMUNITY_JOIN_PENDING")).isNull()
        assertThat(CommunityJoinRefusal.of(null)).isNull()
    }
}
