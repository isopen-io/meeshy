package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * `community:updated` (#18439) appliqué à la fiche tenue par l'appareil — mêmes règles que
 * `CommunityUpdatedEvent+Apply.swift` (iOS, la référence).
 */
class CommunityUpdatedEventTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    private fun event(
        communityId: String = "c1",
        name: String = "Nouveau nom",
        avatar: String? = "https://gate.meeshy.me/a2.png",
        updatedAt: String = "2026-11-15T12:00:00.000Z",
    ) = CommunityUpdatedEvent(
        communityId = communityId, identifier = "mshy_nouveau", name = name, description = "desc",
        avatar = avatar, banner = null, isPrivate = true, memberCount = 7, updatedAt = updatedAt,
    )

    private val member = ApiCommunityMember(id = "m1")

    private fun held(updatedAt: String? = "2026-11-15T11:00:00.000Z") = ApiCommunity(
        id = "c1", identifier = "mshy_ancien", name = "Ancien", description = null,
        avatar = "https://gate.meeshy.me/a1.png", banner = "https://gate.meeshy.me/b1.png", isPrivate = false,
        createdBy = "u1", createdAt = "2026-01-01T00:00:00.000Z", updatedAt = updatedAt,
        members = listOf(member), conversationCount = 3, onlineMemberCount = 4,
    )

    @Test
    fun `la charge de l emetteur se decode cle par cle`() {
        val decoded = json.decodeFromString(
            CommunityUpdatedEvent.serializer(),
            """{"communityId":"c1","identifier":"mshy_x","name":"X","description":null,"avatar":null,
               "banner":"https://gate.meeshy.me/b.png","isPrivate":false,"memberCount":3,
               "updatedAt":"2026-11-15T12:00:00.000Z"}""",
        )
        assertThat(decoded.communityId).isEqualTo("c1")
        assertThat(decoded.identifier).isEqualTo("mshy_x")
        assertThat(decoded.description).isNull()
        assertThat(decoded.banner).isEqualTo("https://gate.meeshy.me/b.png")
        assertThat(decoded.isPrivate).isFalse()
        assertThat(decoded.memberCount).isEqualTo(3)
        assertThat(decoded.updatedAt).isEqualTo("2026-11-15T12:00:00.000Z")
    }

    @Test
    fun `l identite ecrite remplace celle tenue`() {
        val next = held().applying(event())!!
        assertThat(next.identifier).isEqualTo("mshy_nouveau")
        assertThat(next.name).isEqualTo("Nouveau nom")
        assertThat(next.description).isEqualTo("desc")
        assertThat(next.avatar).isEqualTo("https://gate.meeshy.me/a2.png")
        assertThat(next.banner).isNull()
        assertThat(next.isPrivate).isTrue()
        assertThat(next.memberCount).isEqualTo(7)
        assertThat(next.updatedAt).isEqualTo("2026-11-15T12:00:00.000Z")
    }

    @Test
    fun `ce que la charge ne porte pas reste tel quel`() {
        val next = held().applying(event())!!
        assertThat(next.createdBy).isEqualTo("u1")
        assertThat(next.createdAt).isEqualTo("2026-01-01T00:00:00.000Z")
        assertThat(next.members).containsExactly(member)
        assertThat(next.conversationCount).isEqualTo(3)
        assertThat(next.onlineMemberCount).isEqualTo(4)
    }

    @Test
    fun `l effectif servi prime sur un ancien _count`() {
        val withCount = held().copy(count = ApiCommunityCount(members = 99, conversation = 5), conversationCount = null)
        val next = withCount.applying(event())!!.toCommunity()
        assertThat(next.memberCount).isEqualTo(7)
        assertThat(next.conversationCount).isEqualTo(5)
    }

    @Test
    fun `une autre communaute n est jamais touchee`() {
        assertThat(held().applying(event(communityId = "c2"))).isNull()
    }

    @Test
    fun `un evenement plus ancien que la copie ne la recule pas`() {
        assertThat(held().applying(event(updatedAt = "2026-11-15T10:00:00.000Z"))).isNull()
    }

    @Test
    fun `sans date lisible de part ou d autre l evenement s applique`() {
        assertThat(held(updatedAt = null).applying(event())).isNotNull()
        assertThat(held().applying(event(updatedAt = "pas une date"))).isNotNull()
    }

    @Test
    fun `une liste ne change que sur la ligne visee et rend null quand rien ne change`() {
        val other = held().copy(id = "c2", name = "Autre")
        val list = listOf(other, held())
        val next = list.applying(event())!!
        assertThat(next.map { it.name }).containsExactly("Autre", "Nouveau nom").inOrder()
        assertThat(list.applying(event(communityId = "c3"))).isNull()
    }
}
