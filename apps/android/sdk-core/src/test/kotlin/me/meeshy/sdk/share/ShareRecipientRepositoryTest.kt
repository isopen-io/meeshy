package me.meeshy.sdk.share

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiCommunity
import me.meeshy.sdk.model.ApiCommunitySearchResult
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import org.junit.Test

class ShareRecipientRepositoryTest {
    private val me = "me"

    private fun group(id: String, title: String) = ApiConversation(
        id = id, type = "group", title = title,
        participants = listOf(ApiParticipant(id = "p1", userId = "x1"), ApiParticipant(id = "p2", userId = me)),
    )

    private fun direct(id: String, peer: String) = ApiConversation(
        id = id, type = "direct", title = peer,
        participants = listOf(ApiParticipant(id = "a", userId = me), ApiParticipant(id = "b", userId = peer, displayName = peer)),
    )

    private class FakeSources(
        var cached: List<ApiConversation> = emptyList(),
        var friends: List<FriendRequestUser> = emptyList(),
        var communities: List<ApiCommunity> = emptyList(),
        var fresh: List<ApiConversation>? = emptyList(),
        var foundConversations: List<ApiConversation> = emptyList(),
        var foundUsers: List<UserSearchResult> = emptyList(),
        var foundCommunities: List<ApiCommunitySearchResult> = emptyList(),
        var blocked: Set<String> = emptySet(),
    ) : ShareRecipientSources {
        var freshCalls = 0
        var searchCalls = 0
        override suspend fun cachedConversations() = cached
        override suspend fun cachedFriends() = friends
        override suspend fun cachedCommunities() = communities
        override suspend fun freshConversations(): List<ApiConversation>? { freshCalls++; return fresh }
        override suspend fun searchConversations(query: String): List<ApiConversation> { searchCalls++; return foundConversations }
        override suspend fun searchUsers(query: String) = foundUsers
        override suspend fun searchCommunities(query: String) = foundCommunities
        override fun blockedUserIds() = blocked
    }

    private fun repository(sources: FakeSources, online: Boolean = true) =
        ShareRecipientRepository(sources, InMemoryNetworkMonitor(initialOnline = online))

    @Test
    fun `cached conversations are served first, then the fresh page goes ahead of them`() = runTest {
        val sources = FakeSources(cached = listOf(group("c1", "Vieux")), fresh = listOf(group("c2", "Neuf"), group("c1", "Vieux")))
        repository(sources).open(me).test {
            val first = awaitItem()
            assertThat(first.conversations.map { it.id }).containsExactly("conv:c1")
            assertThat(first.load).isEqualTo(ShareDirectoryLoad.CACHED_STALE)
            assertThat(first.showsSkeleton).isFalse()
            val second = awaitItem()
            assertThat(second.conversations.map { it.id }).containsExactly("conv:c2", "conv:c1").inOrder()
            assertThat(second.load).isEqualTo(ShareDirectoryLoad.LOADED)
            awaitComplete()
        }
    }

    @Test
    fun `a skeleton shows only when every cache is empty`() = runTest {
        repository(FakeSources(fresh = listOf(group("c1", "A")))).open(me).test {
            val first = awaitItem()
            assertThat(first.showsSkeleton).isTrue()
            assertThat(awaitItem().showsSkeleton).isFalse()
            awaitComplete()
        }
        repository(FakeSources(friends = listOf(FriendRequestUser(id = "u1", username = "lea")))).open(me).test {
            assertThat(awaitItem().showsSkeleton).isFalse()
            cancelAndConsumeRemainingEvents()
        }
    }

    @Test
    fun `offline keeps the cache, asks nothing and says so discreetly`() = runTest {
        val sources = FakeSources(cached = listOf(group("c1", "A")))
        repository(sources, online = false).open(me).test {
            awaitItem()
            val last = awaitItem()
            assertThat(last.load).isEqualTo(ShareDirectoryLoad.OFFLINE)
            assertThat(last.conversations.map { it.id }).containsExactly("conv:c1")
            awaitComplete()
        }
        assertThat(sources.freshCalls).isEqualTo(0)
    }

    @Test
    fun `a failed revalidation never overwrites the cache`() = runTest {
        val sources = FakeSources(cached = listOf(group("c1", "A")), fresh = null)
        repository(sources).open(me).test {
            awaitItem()
            val last = awaitItem()
            assertThat(last.load).isEqualTo(ShareDirectoryLoad.OFFLINE)
            assertThat(last.conversations.map { it.id }).containsExactly("conv:c1")
            awaitComplete()
        }
        repository(FakeSources(fresh = null)).open(me).test {
            awaitItem()
            assertThat(awaitItem().load).isEqualTo(ShareDirectoryLoad.ERROR)
            awaitComplete()
        }
    }

    @Test
    fun `only writable targets are offered, never the source, a sealed one or a blocked peer`() = runTest {
        val sealed = group("sealed", "Scellée").copy(encryptionMode = "e2ee")
        val sources = FakeSources(
            cached = listOf(group("src", "Source"), sealed, direct("d1", "u1"), direct("d2", "u2"), group("g1", "Équipe")),
            blocked = setOf("u2"),
        )
        repository(sources).open(me, sourceConversationId = "src").test {
            assertThat(awaitItem().conversations.map { it.id }).containsExactly("conv:d1", "conv:g1").inOrder()
            cancelAndConsumeRemainingEvents()
        }
    }

    @Test
    fun `a friend is a person, the communities come from their cache`() = runTest {
        val sources = FakeSources(
            friends = listOf(FriendRequestUser(id = "u1", username = "lea", displayName = "Léa"), FriendRequestUser(id = me, username = "moi")),
            communities = listOf(ApiCommunity(id = "k1", name = "Chess")),
        )
        repository(sources).open(me).test {
            val first = awaitItem()
            assertThat(first.people.map { it.id }).containsExactly("user:u1")
            assertThat(first.people.single().detail).isEqualTo(ShareRecipient.Detail.FriendWithoutConversation)
            assertThat(first.communities.map { it.name }).containsExactly("Chess")
            cancelAndConsumeRemainingEvents()
        }
    }

    @Test
    fun `search merges users, writable conversations and communities and drops me and the blocked`() = runTest {
        val sources = FakeSources(
            foundConversations = listOf(
                group("g9", "Salon"),
                ApiConversation(id = "pub", type = "public", title = "Public", participants = listOf(ApiParticipant(id = "z", userId = "other"))),
            ),
            foundUsers = listOf(UserSearchResult(id = "u7", username = "lena"), UserSearchResult(id = me, username = "moi"), UserSearchResult(id = "u8", username = "bad")),
            foundCommunities = listOf(ApiCommunitySearchResult(id = "k2", name = "Léa corp")),
            blocked = setOf("u8"),
        )
        val results = repository(sources).search("le", me)
        assertThat(results.people.map { it.id }).containsExactly("user:u7")
        assertThat(results.people.single().detail).isEqualTo(ShareRecipient.Detail.Handle("lena"))
        assertThat(results.conversations.map { it.id }).containsExactly("conv:g9")
        assertThat(results.communities.map { it.id }).containsExactly("k2")
    }

    @Test
    fun `offline search is local only`() = runTest {
        val sources = FakeSources(foundUsers = listOf(UserSearchResult(id = "u7", username = "lena")))
        val results = repository(sources, online = false).search("lena", me)
        assertThat(results.people).isEmpty()
        assertThat(sources.searchCalls).isEqualTo(0)
    }
}
