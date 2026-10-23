package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class CommunityDecodingTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private fun decode(raw: String) = json.decodeFromString(ApiCommunity.serializer(), raw).toCommunity()

    @Test
    fun `les comptages plats priment sur _count`() {
        val c = decode("""{"id":"c","memberCount":5,"conversationCount":2,"_count":{"members":9,"Conversation":8}}""")
        assertThat(c.memberCount).isEqualTo(5)
        assertThat(c.conversationCount).isEqualTo(2)
    }

    @Test
    fun `_count sert quand les comptages plats manquent`() {
        val c = decode("""{"id":"c","_count":{"members":9,"Conversation":8}}""")
        assertThat(c.memberCount).isEqualTo(9)
        assertThat(c.conversationCount).isEqualTo(8)
    }

    @Test
    fun `sans aucun comptage rien ne casse et les membres listes comptent`() {
        assertThat(decode("""{"id":"c"}""").memberCount).isEqualTo(0)
        val c = decode("""{"id":"c","members":[{"id":"m1"},{"id":"m2"}]}""")
        assertThat(c.memberCount).isEqualTo(2)
        assertThat(c.conversationCount).isEqualTo(0)
    }

    @Test
    fun `membre sans contour ni role se decode avec les defauts`() {
        val c = json.decodeFromString(ApiCommunity.serializer(), """{"id":"c","members":[{"id":"m","user":{"id":"u"}}]}""")
        val m = c.members!!.single()
        assertThat(m.communityRole).isEqualTo(MemberRole.MEMBER)
        assertThat(m.user!!.profileDecor).isNull()
    }

    @Test
    fun `la communaute de domaine porte les defauts iOS`() {
        val c = decode("""{"id":"c"}""")
        assertThat(c.emoji).isEmpty()
        assertThat(c.color).isEqualTo("4ECDC4")
        assertThat(c.theme).isEqualTo("general")
        assertThat(c.language).isEqualTo("french")
        assertThat(c.bannerThumbHash).isNull()
    }
}
