package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommunityPresentationTest {

    private fun api(
        memberCount: Int? = null,
        conversationCount: Int? = null,
        count: ApiCommunityCount? = null,
        isPrivate: Boolean = false,
        createdBy: String = "u1",
    ) = ApiCommunity(
        id = "c1",
        identifier = "mshy-c1",
        name = "Café",
        isPrivate = isPrivate,
        createdBy = createdBy,
        count = count,
        memberCount = memberCount,
        conversationCount = conversationCount,
    )

    @Test
    fun `les compteurs plats priment sur _count`() {
        val community = api(memberCount = 12, conversationCount = 3, count = ApiCommunityCount(members = 99, conversation = 98)).toCommunity()

        assertThat(community.memberCount).isEqualTo(12)
        assertThat(community.conversationCount).isEqualTo(3)
    }

    @Test
    fun `_count prend le relais quand les compteurs plats manquent`() {
        val community = api(count = ApiCommunityCount(members = 7, conversation = 4)).toCommunity()

        assertThat(community.memberCount).isEqualTo(7)
        assertThat(community.conversationCount).isEqualTo(4)
    }

    @Test
    fun `chaque compteur retombe sur son propre repli`() {
        val community = api(memberCount = 5, count = ApiCommunityCount(members = 1, conversation = 9)).toCommunity()

        assertThat(community.memberCount).isEqualTo(5)
        assertThat(community.conversationCount).isEqualTo(9)
    }

    @Test
    fun `tout nul vaut zero`() {
        val community = api(count = ApiCommunityCount()).toCommunity()
        val bare = api().toCommunity()

        assertThat(community.memberCount).isEqualTo(0)
        assertThat(community.conversationCount).isEqualTo(0)
        assertThat(bare.memberCount).isEqualTo(0)
        assertThat(bare.conversationCount).isEqualTo(0)
    }

    @Test
    fun `isPrivate et createdBy sont conserves`() {
        val community = api(isPrivate = true, createdBy = "owner").toCommunity()

        assertThat(community.isPrivate).isTrue()
        assertThat(community.createdBy).isEqualTo("owner")
        assertThat(community.id).isEqualTo("c1")
        assertThat(community.identifier).isEqualTo("mshy-c1")
    }

    @Test
    fun `un resultat de recherche se projette de la meme facon`() {
        val result = ApiCommunitySearchResult(id = "s1", name = "Club", memberCount = 3, isPrivate = true)

        val community = result.toCommunity()

        assertThat(community.memberCount).isEqualTo(3)
        assertThat(community.conversationCount).isEqualTo(0)
        assertThat(community.isPrivate).isTrue()
    }
}
