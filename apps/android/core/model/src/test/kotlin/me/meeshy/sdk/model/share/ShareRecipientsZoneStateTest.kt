package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareRecipientsZoneStateTest {
    private fun person(id: String) = ShareRecipient.person(id, "P$id", ShareRecipient.Detail.FriendWithoutConversation, null)
    private fun group() = ShareRecipient.conversation("g", "G", ShareRecipient.Detail.Group(4), null, null, null)
    private val community = ShareCommunity("c1", "Com", null)
    private fun view(vararg people: ShareRecipient, communities: List<ShareCommunity> = emptyList()) =
        ShareDirectoryView(emptyList(), emptyList(), people.toList(), communities)

    private fun zone(
        view: ShareDirectoryView = view(),
        cacheEmpty: Boolean = false,
        loading: Boolean = false,
        found: ShareSearchResults? = null,
        selection: List<ShareRecipient> = emptyList(),
        supported: Boolean = true,
        channels: Map<String, List<ShareRecipient>> = emptyMap(),
    ) = ShareRecipientsZoneState.of(view, cacheEmpty, loading, found, selection, supported, channels)

    @Test
    fun `a cold empty cache while loading shows a skeleton of three rows`() {
        assertThat(zone(cacheEmpty = true, loading = true).content).isEqualTo(ShareRecipientsZoneContent.Skeleton(3))
    }

    @Test
    fun `a non empty cache never shows a skeleton even while loading`() {
        assertThat(zone(view(person("1")), loading = true).content).isEqualTo(ShareRecipientsZoneContent.Listing)
    }

    @Test
    fun `an empty cache that finished loading shows the empty state until a search answers`() {
        assertThat(zone(cacheEmpty = true).content).isEqualTo(ShareRecipientsZoneContent.Empty)
        assertThat(zone(cacheEmpty = true, found = ShareSearchResults.EMPTY).content).isEqualTo(ShareRecipientsZoneContent.Listing)
    }

    @Test
    fun `group creation is offered from two people ticked, never for groups`() {
        assertThat(zone(selection = listOf(person("1"))).offersGroupCreation).isFalse()
        assertThat(zone(selection = listOf(person("1"), group())).offersGroupCreation).isFalse()
        val two = zone(selection = listOf(person("1"), person("2")))
        assertThat(two.offersGroupCreation).isTrue()
        assertThat(two.groupCandidateNames).isEqualTo("P1, P2")
        assertThat(zone(selection = listOf(person("1"), person("2")), supported = false).offersGroupCreation).isFalse()
    }

    @Test
    fun `a community unfolds into its writable channels and an empty list stays unfolded`() {
        val channel = ShareRecipient.conversation("k", "Général", ShareRecipient.Detail.Channel("Com"), null, null, null)
        val state = zone(view(communities = listOf(community)), channels = mapOf("c1" to listOf(channel)))
        assertThat(state.communities.single().isExpanded).isTrue()
        assertThat(state.communities.single().channels).containsExactly(channel)
        assertThat(zone(view(communities = listOf(community)), channels = mapOf("c1" to emptyList())).communities.single().isExpanded).isTrue()
        assertThat(zone(view(communities = listOf(community))).communities.single().isExpanded).isFalse()
    }
}
