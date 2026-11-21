package me.meeshy.sdk.community

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.builtins.ListSerializer
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.ApiCommunity
import me.meeshy.sdk.model.ApiCommunityMember
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CommunityDeletedEvent
import me.meeshy.sdk.model.CommunityJoinRequestDecidedEvent
import me.meeshy.sdk.model.CommunityMemberChange
import me.meeshy.sdk.model.CommunityUpdatedEvent
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.ContentFetchFailure
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.api.CommunityApi
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.IOException

@RunWith(RobolectricTestRunner::class)
class CommunityCacheRepositoryTest {

    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock()
    private val api = mockk<CommunityApi>()

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun cache() = KeyedJsonCache(db.keyedJsonCacheDao(), clock)

    private fun repository() = CommunityCacheRepository(CommunityRepository(api), cache(), clock)

    private fun community(id: String) = ApiCommunity(id = id, name = "Com $id")

    private fun listResponse(vararg ids: String) =
        ApiResponse(success = true, data = ids.map(::community))

    @Test fun `a froid la liste est Empty puis la valeur reseau`() = runTest {
        coEvery { api.list(any(), any(), any()) } returns listResponse("a")

        val results = repository().list().take(2).toList()

        assertThat(results[0]).isEqualTo(CacheResult.Empty)
        assertThat((results[1] as CacheResult.Fresh).value.map { it.id }).containsExactly("a")
    }

    @Test fun `un cache frais est servi sans reseau`() = runTest {
        cache().put("community:list", "page0", listOf(community("a")), ListSerializer(ApiCommunity.serializer()), null)

        val first = repository().list().first()

        assertThat(first).isInstanceOf(CacheResult.Fresh::class.java)
        coVerify(exactly = 0) { api.list(any(), any(), any()) }
    }

    @Test fun `un cache perime est servi Stale puis revalide`() = runTest {
        cache().put("community:list", "page0", listOf(community("old")), ListSerializer(ApiCommunity.serializer()), null)
        clock.now += 10 * 60_000
        coEvery { api.list(any(), any(), any()) } returns listResponse("new")

        val results = repository().list().take(2).toList()

        assertThat(results[0]).isInstanceOf(CacheResult.Stale::class.java)
        assertThat((results[0] as CacheResult.Stale).value.map { it.id }).containsExactly("old")
        assertThat((results[1] as CacheResult.Fresh).value.map { it.id }).containsExactly("new")
    }

    @Test fun `un cache expire est Syncing avec ses donnees`() = runTest {
        cache().put("community:list", "page0", listOf(community("old")), ListSerializer(ApiCommunity.serializer()), null)
        clock.now += 3 * 24 * 60 * 60_000L
        coEvery { api.list(any(), any(), any()) } throws IOException("hors ligne")

        val first = repository().list().first()

        assertThat(first).isInstanceOf(CacheResult.Syncing::class.java)
    }

    @Test fun `un echec reseau conserve le cache`() = runTest {
        cache().put("community:list", "page0", listOf(community("old")), ListSerializer(ApiCommunity.serializer()), null)
        clock.now += 10 * 60_000
        coEvery { api.list(any(), any(), any()) } throws IOException("hors ligne")

        val results = repository().list().take(1).toList()

        assertThat((results.single() as CacheResult.Stale).value.map { it.id }).containsExactly("old")
        assertThat(cache().get("community:list", "page0", ListSerializer(ApiCommunity.serializer()))?.value).hasSize(1)
    }

    @Test fun `la fiche, les membres et les channels ont chacun leur ressource`() = runTest {
        coEvery { api.get("c1") } returns ApiResponse(success = true, data = community("c1"))
        coEvery { api.getMembers("c1", any(), any()) } returns
            ApiResponse(success = true, data = listOf(ApiCommunityMember(id = "m1", userId = "u1")))
        coEvery { api.getConversations("c1") } returns ApiResponse(success = true, data = emptyList())
        val repository = repository()

        val detail = repository.detail("c1").take(2).toList().last()
        val members = repository.members("c1").take(2).toList().last()
        val channels = repository.channels("c1").take(2).toList().last()

        assertThat((detail as CacheResult.Fresh).value.id).isEqualTo("c1")
        assertThat((members as CacheResult.Fresh).value.single().userId).isEqualTo("u1")
        assertThat((channels as CacheResult.Fresh).value).isEmpty()
    }

    @Test fun `forget n'efface que la communaute visee`() = runTest {
        val c = cache()
        c.put("community:detail", "c1", community("c1"), ApiCommunity.serializer(), null)
        c.put("community:detail", "c2", community("c2"), ApiCommunity.serializer(), null)

        repository().forget("c1")

        assertThat(c.get("community:detail", "c1", ApiCommunity.serializer())).isNull()
        assertThat(c.get("community:detail", "c2", ApiCommunity.serializer())).isNotNull()
    }


    @Test fun `un refus de lecture porte sa cause, jamais le seul statut`() {
        assertThat(ApiError("denied", httpStatus = 403).toCommunityFetchException().failure).isEqualTo(ContentFetchFailure.FORBIDDEN)
        assertThat(ApiError("gone", httpStatus = 404).toCommunityFetchException().failure).isEqualTo(ContentFetchFailure.NOT_FOUND)
        assertThat(ApiError("boom", httpStatus = 500).toCommunityFetchException().failure).isEqualTo(ContentFetchFailure.SERVER)
        assertThat(ApiError("offline", code = "NETWORK").toCommunityFetchException().failure).isEqualTo(ContentFetchFailure.NETWORK)
        assertThat(ApiError("parse", code = "PARSE").toCommunityFetchException().failure).isEqualTo(ContentFetchFailure.SERVER)
    }

    private fun updated(communityId: String, name: String, updatedAt: String = "2026-11-15T12:00:00.000Z") =
        CommunityUpdatedEvent(
            communityId = communityId, identifier = "mshy_$communityId", name = name, isPrivate = false,
            memberCount = 4, updatedAt = updatedAt,
        )

    @Test fun `community updated reecrit la fiche et la ligne de liste sans relance reseau`() = runTest {
        val members = listOf(ApiCommunityMember(id = "m1"))
        cache().put("community:detail", "c1", community("c1").copy(members = members), ApiCommunity.serializer(), null)
        cache().put("community:list", "page0", listOf(community("c0"), community("c1")), ListSerializer(ApiCommunity.serializer()), null)

        repository().applyUpdate(updated("c1", "Renommee"))

        val detail = cache().get("community:detail", "c1", ApiCommunity.serializer())!!.value
        assertThat(detail.name).isEqualTo("Renommee")
        assertThat(detail.memberCount).isEqualTo(4)
        assertThat(detail.members).isEqualTo(members)
        val list = cache().get("community:list", "page0", ListSerializer(ApiCommunity.serializer()))!!.value
        assertThat(list.map { it.name }).containsExactly("Com c0", "Renommee").inOrder()
        coVerify(exactly = 0) { api.list(any(), any(), any()) }
    }

    @Test fun `community updated ne cree rien quand l appareil ne tient pas la communaute`() = runTest {
        repository().applyUpdate(updated("c9", "Inconnue"))

        assertThat(cache().get("community:detail", "c9", ApiCommunity.serializer())).isNull()
        assertThat(cache().get("community:list", "page0", ListSerializer(ApiCommunity.serializer()))).isNull()
    }

    @Test fun `community updated ne rajeunit pas l instant de lecture`() = runTest {
        cache().put("community:detail", "c1", community("c1"), ApiCommunity.serializer(), null)
        val fetchedAt = cache().get("community:detail", "c1", ApiCommunity.serializer())!!.fetchedAt
        clock.now += 60_000

        repository().applyUpdate(updated("c1", "Renommee"))

        assertThat(cache().get("community:detail", "c1", ApiCommunity.serializer())!!.fetchedAt).isEqualTo(fetchedAt)
    }

    private fun memberChange(
        userId: String,
        role: MemberRole?,
        kind: CommunityMemberChange.Kind = if (role == null) CommunityMemberChange.Kind.LEFT else CommunityMemberChange.Kind.JOINED,
        memberCount: Int = 3,
    ) = CommunityMemberChange(kind, "c1", userId, memberCount, role)

    private fun line(userId: String, role: String = "member") = ApiCommunityMember(id = "m-$userId", communityId = "c1", userId = userId, role = role)

    private val membersSerializer = ListSerializer(ApiCommunityMember.serializer())
    private val pageSerializer = ListSerializer(ApiCommunity.serializer())

    @Test fun `un tiers qui entre recopie l effectif et fait relire la liste des membres tenue`() = runTest {
        cache().put("community:detail", "c1", community("c1").copy(members = listOf(line("me")), memberCount = 2), ApiCommunity.serializer(), null)
        cache().put("community:list", "page0", listOf(community("c0"), community("c1")), pageSerializer, null)
        cache().put("community:members", "c1", listOf(line("me")), membersSerializer, null)
        coEvery { api.getMembers("c1", any(), any()) } returns ApiResponse(success = true, data = listOf(line("me"), line("u3")))

        repository().applyMemberChange(memberChange("u3", MemberRole.MEMBER), viewerId = "me")

        assertThat(cache().get("community:detail", "c1", ApiCommunity.serializer())!!.value.memberCount).isEqualTo(3)
        assertThat(cache().get("community:list", "page0", pageSerializer)!!.value.map { it.memberCount }).containsExactly(null, 3).inOrder()
        assertThat(cache().get("community:members", "c1", membersSerializer)!!.value.map { it.userId }).containsExactly("me", "u3")
        coVerify(exactly = 0) { api.list(any(), any(), any()) }
    }

    @Test fun `un depart ou un role suit la liste des membres tenue sans reseau`() = runTest {
        cache().put("community:members", "c1", listOf(line("me"), line("u2"), line("u3")), membersSerializer, null)
        val repository = repository()

        repository.applyMemberChange(memberChange("u2", null, memberCount = 2), viewerId = "me")
        repository.applyMemberChange(memberChange("u3", MemberRole.MODERATOR, CommunityMemberChange.Kind.ROLE_UPDATED, 2), viewerId = "me")

        val members = cache().get("community:members", "c1", membersSerializer)!!.value
        assertThat(members.map { it.userId to it.communityRole }).containsExactly("me" to MemberRole.MEMBER, "u3" to MemberRole.MODERATOR).inOrder()
        coVerify(exactly = 0) { api.getMembers(any(), any(), any()) }
        coVerify(exactly = 0) { api.list(any(), any(), any()) }
    }

    @Test fun `le lecteur promu tient son nouveau role sans relire sa liste`() = runTest {
        cache().put("community:detail", "c1", community("c1").copy(members = listOf(line("me"))), ApiCommunity.serializer(), null)

        repository().applyMemberChange(memberChange("me", MemberRole.ADMIN, CommunityMemberChange.Kind.ROLE_UPDATED, 1), viewerId = "me")

        val detail = cache().get("community:detail", "c1", ApiCommunity.serializer())!!.value
        assertThat(detail.members!!.single().communityRole).isEqualTo(MemberRole.ADMIN)
        coVerify(exactly = 0) { api.list(any(), any(), any()) }
    }

    @Test fun `le lecteur retire d une communaute privee n en garde ni membres ni channels et relit sa liste`() = runTest {
        cache().put("community:detail", "c1", community("c1").copy(isPrivate = true, members = listOf(line("me"))), ApiCommunity.serializer(), null)
        cache().put("community:members", "c1", listOf(line("me"), line("u2")), membersSerializer, null)
        cache().put("community:channels", "c1", emptyList(), ListSerializer(me.meeshy.sdk.model.ApiConversation.serializer()), null)
        coEvery { api.list(any(), any(), any()) } returns listResponse("c0")

        repository().applyMemberChange(memberChange("me", null, memberCount = 1), viewerId = "me")

        val detail = cache().get("community:detail", "c1", ApiCommunity.serializer())!!.value
        assertThat(detail.members).isEmpty()
        assertThat(detail.memberCount).isEqualTo(1)
        assertThat(cache().get("community:members", "c1", membersSerializer)).isNull()
        assertThat(cache().get("community:channels", "c1", ListSerializer(me.meeshy.sdk.model.ApiConversation.serializer()))).isNull()
        assertThat(cache().get("community:list", "page0", pageSerializer)!!.value.map { it.id }).containsExactly("c0")
    }

    @Test fun `le lecteur qui quitte une communaute publique garde la liste des membres, sans sa ligne`() = runTest {
        cache().put("community:detail", "c1", community("c1").copy(isPrivate = false, members = listOf(line("me"))), ApiCommunity.serializer(), null)
        cache().put("community:members", "c1", listOf(line("me"), line("u2")), membersSerializer, null)
        coEvery { api.list(any(), any(), any()) } returns listResponse("c0", "c1")

        repository().applyMemberChange(memberChange("me", null, memberCount = 1), viewerId = "me")

        assertThat(cache().get("community:members", "c1", membersSerializer)!!.value.map { it.userId }).containsExactly("u2")
    }

    @Test fun `un geste sur une communaute que l appareil ne tient pas ne cree rien`() = runTest {
        repository().applyMemberChange(memberChange("u3", MemberRole.MEMBER), viewerId = "me")

        assertThat(cache().get("community:detail", "c1", ApiCommunity.serializer())).isNull()
        assertThat(cache().get("community:members", "c1", membersSerializer)).isNull()
        coVerify(exactly = 0) { api.getMembers(any(), any(), any()) }
    }

    @Test fun `community deleted retire la ligne de la liste et oublie fiche, membres et channels`() = runTest {
        val channels = ListSerializer(me.meeshy.sdk.model.ApiConversation.serializer())
        cache().put("community:list", "page0", listOf(community("c0"), community("c1")), pageSerializer, null)
        cache().put("community:detail", "c1", community("c1"), ApiCommunity.serializer(), null)
        cache().put("community:members", "c1", listOf(line("u2")), membersSerializer, null)
        cache().put("community:channels", "c1", emptyList(), channels, null)
        cache().put("community:detail", "c2", community("c2"), ApiCommunity.serializer(), null)

        repository().applyDeleted(CommunityDeletedEvent(communityId = "c1", reason = "deleted"))

        assertThat(cache().get("community:list", "page0", pageSerializer)!!.value.map { it.id }).containsExactly("c0")
        assertThat(cache().get("community:detail", "c1", ApiCommunity.serializer())).isNull()
        assertThat(cache().get("community:members", "c1", membersSerializer)).isNull()
        assertThat(cache().get("community:channels", "c1", channels)).isNull()
        assertThat(cache().get("community:detail", "c2", ApiCommunity.serializer())).isNotNull()
        coVerify(exactly = 0) { api.list(any(), any(), any()) }
    }

    @Test fun `le detail d une communaute disparue repart a froid, donc se relit et rend le refus de la passerelle`() = runTest {
        cache().put("community:detail", "c1", community("c1"), ApiCommunity.serializer(), null)
        coEvery { api.get("c1") } throws IOException("404")
        val repository = repository()

        repository.applyDeleted(CommunityDeletedEvent(communityId = "c1", reason = "deactivated"))
        val failures = mutableListOf<Throwable>()
        val results = repository.detail("c1", onError = { failures += it }).take(1).toList()

        assertThat(results.single()).isEqualTo(CacheResult.Empty)
    }

    @Test fun `une charge sans communaute ne touche a rien`() = runTest {
        cache().put("community:list", "page0", listOf(community("c1")), pageSerializer, null)

        repository().applyDeleted(CommunityDeletedEvent(communityId = ""))

        assertThat(cache().get("community:list", "page0", pageSerializer)!!.value.map { it.id }).containsExactly("c1")
    }

    private fun refused(communityId: String) =
        CommunityJoinRequestDecidedEvent(communityId, decision = "rejected", retryAt = "2026-11-27T12:00:00.000Z", at = "2026-11-20T12:00:00.000Z")

    @Test fun `le refus de sa demande reecrit la fiche tenue sans reseau ni rajeunir sa lecture`() = runTest {
        cache().put("community:detail", "c1", community("c1").copy(requiresJoinApproval = true, currentUserJoinRequest = "pending"), ApiCommunity.serializer(), null)
        val fetchedAt = cache().get("community:detail", "c1", ApiCommunity.serializer())!!.fetchedAt
        clock.now += 60_000

        repository().applyJoinRequestDecided(refused("c1"))

        val held = cache().get("community:detail", "c1", ApiCommunity.serializer())!!
        assertThat(held.value.currentUserJoinRequest).isNull()
        assertThat(held.value.currentUserJoinRetryAt).isEqualTo("2026-11-27T12:00:00.000Z")
        assertThat(held.fetchedAt).isEqualTo(fetchedAt)
        coVerify(exactly = 0) { api.get(any()) }
    }

    @Test fun `le refus d une communaute que l appareil ne tient pas ne cree rien`() = runTest {
        repository().applyJoinRequestDecided(refused("c9"))

        assertThat(cache().get("community:detail", "c9", ApiCommunity.serializer())).isNull()
    }
}
