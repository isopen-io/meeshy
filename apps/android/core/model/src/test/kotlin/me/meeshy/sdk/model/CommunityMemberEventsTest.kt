package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * L'effectif d'une communauté en temps réel (#18768) : les trois charges de
 * `services/gateway/src/services/community-member-broadcast.ts`, lues et appliquées à ce que
 * l'appareil tient — mêmes règles que le web (`community-member-live.ts`).
 */
class CommunityMemberEventsTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    private fun line(userId: String, role: String = "member") = ApiCommunityMember(id = "m-$userId", communityId = "c1", userId = userId, role = role)

    private fun held(members: List<ApiCommunityMember>? = listOf(line("u1", "admin"), line("u2"))) = ApiCommunity(
        id = "c1", identifier = "mshy_c1", name = "C", createdBy = "u1", isPrivate = true,
        members = members, memberCount = 2, conversationCount = 3, onlineMemberCount = 4,
    )

    private fun change(userId: String = "u3", role: MemberRole? = MemberRole.MEMBER, memberCount: Int = 3, communityId: String = "c1") =
        CommunityMemberChange(communityId, userId, memberCount, role)

    @Test
    fun `la charge member-joined se decode cle par cle`() {
        val decoded = json.decodeFromString(
            CommunityMemberJoinedEvent.serializer(),
            """{"communityId":"c1","userId":"u3","role":"moderator","via":"invited","memberCount":3,"at":"2026-11-17T12:00:00.000Z"}""",
        )
        assertThat(decoded.via).isEqualTo("invited")
        assertThat(decoded.at).isEqualTo("2026-11-17T12:00:00.000Z")
        assertThat(decoded.change).isEqualTo(change(role = MemberRole.MODERATOR))
    }

    @Test
    fun `la charge member-left se decode et dit que la personne est sortie`() {
        val decoded = json.decodeFromString(
            CommunityMemberLeftEvent.serializer(),
            """{"communityId":"c1","userId":"u2","reason":"removed","memberCount":1,"at":"2026-11-17T12:00:00.000Z"}""",
        )
        assertThat(decoded.reason).isEqualTo("removed")
        assertThat(decoded.change).isEqualTo(change(userId = "u2", role = null, memberCount = 1))
        assertThat(decoded.change!!.hasLeft).isTrue()
    }

    @Test
    fun `la charge member-role-updated se decode cle par cle`() {
        val decoded = json.decodeFromString(
            CommunityMemberRoleUpdatedEvent.serializer(),
            """{"communityId":"c1","userId":"u2","role":"admin","memberCount":2,"at":"2026-11-17T12:00:00.000Z"}""",
        )
        assertThat(decoded.change).isEqualTo(change(userId = "u2", role = MemberRole.ADMIN, memberCount = 2))
    }

    @Test
    fun `un role inconnu, un effectif negatif ou une communaute vide ne se lisent pas`() {
        assertThat(CommunityMemberRoleUpdatedEvent("c1", "u2", "creator", 2).change).isNull()
        assertThat(CommunityMemberJoinedEvent("c1", "u2", "ADMIN", memberCount = 2).change).isNull()
        assertThat(CommunityMemberLeftEvent("c1", "u2", memberCount = -1).change).isNull()
        assertThat(CommunityMemberLeftEvent("", "u2", memberCount = 1).change).isNull()
        assertThat(CommunityMemberLeftEvent("c1", "", memberCount = 1).change).isNull()
    }

    @Test
    fun `un tiers qui entre change l effectif sans etre invente dans la fiche`() {
        val next = held().applying(change(), viewerId = "u2")!!
        assertThat(next.memberCount).isEqualTo(3)
        assertThat(next.members!!.map { it.userId }).containsExactly("u1", "u2").inOrder()
        assertThat(next.onlineMemberCount).isEqualTo(4)
        assertThat(next.conversationCount).isEqualTo(3)
    }

    @Test
    fun `le lecteur qui entre recoit sa ligne et donc son role`() {
        val next = held().applying(change(userId = "me", role = MemberRole.MEMBER), viewerId = "me")!!
        val membership = CommunityMembership.resolve(next.createdBy, "me", next.members.orEmpty())
        assertThat(membership.isMember).isTrue()
        assertThat(membership.role).isEqualTo(MemberRole.MEMBER)
    }

    @Test
    fun `le lecteur entre meme quand la fiche ne tient aucune ligne`() {
        val next = held(members = null).applying(change(userId = "me"), viewerId = "me")!!
        assertThat(next.members!!.single().userId).isEqualTo("me")
    }

    @Test
    fun `un role change suit la ligne tenue et ce que le lecteur peut faire`() {
        val next = held().applying(change(userId = "u2", role = MemberRole.ADMIN, memberCount = 2), viewerId = "u2")!!
        val access = CommunityAccess.resolve(next.createdBy, next.isPrivate, "u2", next.members.orEmpty())
        assertThat(access.canManageMembers).isTrue()
    }

    @Test
    fun `le lecteur retire perd sa ligne, donc ses droits`() {
        val next = held().applying(change(userId = "u2", role = null, memberCount = 1), viewerId = "u2")!!
        assertThat(next.memberCount).isEqualTo(1)
        assertThat(CommunityMembership.resolve(next.createdBy, "u2", next.members.orEmpty()).isMember).isFalse()
    }

    @Test
    fun `une autre communaute ou un geste sans effet ne rend rien`() {
        assertThat(held().applying(change(communityId = "c2"), viewerId = "u2")).isNull()
        assertThat(held().applying(change(userId = "u2", role = MemberRole.MEMBER, memberCount = 2), viewerId = "u2")).isNull()
    }

    @Test
    fun `une page ne change que sur la ligne visee`() {
        val other = held().copy(id = "c2")
        val page = listOf(other, held())
        val next = page.applying(change(), viewerId = "u2")!!
        assertThat(next[0]).isSameInstanceAs(other)
        assertThat(next[1].memberCount).isEqualTo(3)
        assertThat(listOf(other).applying(change(), viewerId = "u2")).isNull()
    }

    @Test
    fun `la liste des membres tenue suit un depart et un role, jamais une entree`() {
        val members = listOf(line("u1", "admin"), line("u2"))
        assertThat(members.applyingMember(change(userId = "u2", role = null))!!.map { it.userId }).containsExactly("u1")
        assertThat(members.applyingMember(change(userId = "u2", role = MemberRole.MODERATOR))!![1].communityRole)
            .isEqualTo(MemberRole.MODERATOR)
        assertThat(members.applyingMember(change(userId = "u3"))).isNull()
        assertThat(members.applyingMember(change(userId = "u2", role = MemberRole.MEMBER))).isNull()
    }
}
