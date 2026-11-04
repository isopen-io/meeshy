package me.meeshy.sdk.cache.store

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.conversation.ParticipantsCacheSource
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MemberRosterPage
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.search.UserSearchCacheSource
import me.meeshy.sdk.user.ProfileCacheSource
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RegistryEnrollmentTest {
    private val db = inMemoryDatabase()
    private val registry = CacheStoreRegistry(Dispatchers.Unconfined)
    private val module = ProfilesParticipantsCacheModule

    @After fun tearDown() = db.close()

    @Test
    fun `chaque source est inventoriee dans le registre`() {
        module.profileCacheSource(registry, db.cacheEntryDao(), fence())
        module.participantsCacheSource(registry, db.cacheEntryDao(), fence())
        module.userSearchCacheSource(registry, db.cacheEntryDao(), fence())

        assertThat(registry.namespaces()).containsAtLeast(
            ProfileCacheSource.NAMESPACE,
            ParticipantsCacheSource.NAMESPACE,
            UserSearchCacheSource.NAMESPACE,
        )
    }

    @Test
    fun `la deconnexion vide les profils les participants et la recherche`() = runTest {
        val profiles = module.profileCacheSource(registry, db.cacheEntryDao(), fence())
        val participants = module.participantsCacheSource(registry, db.cacheEntryDao(), fence())
        val search = module.userSearchCacheSource(registry, db.cacheEntryDao(), fence())
        profiles.remember(MeeshyUser(id = "1", username = "bob"), null)
        participants.replaceFirstPage("c1", MemberRosterPage(listOf(PaginatedParticipant(id = "a")), "n", true), null)
        search.remember("bob", listOf(UserSearchResult(id = "1", username = "bob")), null)

        registry.clear()

        assertThat(profiles.cached("1")).isNull()
        assertThat(participants.cached("c1")).isNull()
        assertThat(search.cached("bob")).isNull()
    }

    @Test
    fun `les plafonds et fenetres sont ceux d iOS`() {
        assertThat(CachePolicy.Profiles.maxItemCount).isEqualTo(100)
        assertThat(CachePolicy.Participants.freshForMillis).isEqualTo(5 * 60_000L)
        assertThat(CachePolicy.Participants.keepForMillis).isEqualTo(24 * 60 * 60_000L)
    }

    private var owner: String? = "A"
    private val accountFence = me.meeshy.sdk.session.AccountFence(me.meeshy.sdk.outbox.OutboxOwnerSource { owner })

    private fun fence() = accountFence

    @Test
    fun `une reponse du compte precedent n ecrit rien dans le cache du suivant`() = runTest {
        val search = module.userSearchCacheSource(registry, db.cacheEntryDao(), fence())
        val ticket = search.ticket()

        owner = "B"
        search.remember("bob", listOf(UserSearchResult(id = "1", username = "bob")), ticket)

        assertThat(search.cached("bob")).isNull()
    }
}
