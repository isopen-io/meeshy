package me.meeshy.sdk.profile

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PublicProfile
import me.meeshy.sdk.model.UserStats
import me.meeshy.sdk.model.profile.ProfileLoadState
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.user.ProfileStatsCacheRepository
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private class FakeRemote(var profile: NetworkResult<PublicProfile>, var stats: NetworkResult<UserStats>) : ProfileRemote {
    var profileCalls = 0
    var statsCalls = 0
    override suspend fun profile(handle: String): NetworkResult<PublicProfile> { profileCalls++; return profile }
    override suspend fun stats(userId: String): NetworkResult<UserStats> { statsCalls++; return stats }
}

@RunWith(RobolectricTestRunner::class)
class ProfileSheetLoaderTest {
    private val db = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext(),
        MeeshyDatabase::class.java,
    ).allowMainThreadQueries().build()
    private val profiles = ProfileCacheRepository(db.keyedJsonCacheDao())
    private val statsCache = ProfileStatsCacheRepository(db.profileStatsCacheDao())
    private val id = "64b7f0a1c2d3e4f5a6b7c8d9"
    private val bob = MeeshyUser(id = id, username = "bob", displayName = "Bob")
    private val stats = UserStats(totalMessages = 7)

    @After
    fun tearDown() = db.close()

    private fun ok(user: MeeshyUser = bob, with: UserStats? = stats) = NetworkResult.Success(PublicProfile(user, with))
    private fun failure(status: Int?, code: String? = null) = NetworkResult.Failure(ApiError("x", code, status))
    private fun loader(remote: FakeRemote, effects: ProfileLoadSideEffects = ProfileLoadSideEffects(emptyList())) =
        ProfileSheetLoader(profiles, statsCache, remote, effects)

    private suspend fun ProfileSheetLoader.states(userId: String?, username: String, retry: Boolean = false): List<ProfileLoadState> =
        open(userId, username, retry).toList()

    @Test
    fun `le cache est emis avant le reseau puis la synchro part meme frais`() = runTest {
        profiles.store(bob, id)
        statsCache.persistStats(id, UserStats(totalMessages = 1))
        val remote = FakeRemote(ok(), failure(null))
        loader(remote).open(id, "bob").test {
            val cached = awaitItem()
            assertThat(remote.profileCalls).isEqualTo(0)
            assertThat(cached.profile).isEqualTo(bob)
            assertThat(cached.stats?.totalMessages).isEqualTo(1)
            assertThat(cached.isLoadingProfile).isFalse()
            val last = cancelAndConsumeRemainingEvents().filterIsInstance<app.cash.turbine.Event.Item<ProfileLoadState>>().last().value
            assertThat(last.stats?.totalMessages).isEqualTo(7)
        }
        assertThat(remote.profileCalls).isEqualTo(1)
    }

    @Test
    fun `statistiques du meme document mises en cache sous l'id`() = runTest {
        val remote = FakeRemote(ok(), failure(500))
        loader(remote).states(null, "bob")
        assertThat(remote.statsCalls).isEqualTo(0)
        assertThat(statsCache.cachedStats(id)).isEqualTo(stats)
        assertThat(profiles.cachedProfile("bob")).isEqualTo(bob)
    }

    @Test
    fun `statistiques absentes du document sont relues avec l'id resolu et un echec reste silencieux`() = runTest {
        val remote = FakeRemote(ok(with = null), failure(500))
        val states = loader(remote).states(null, "bob")
        assertThat(remote.statsCalls).isEqualTo(1)
        assertThat(states.last().profile).isEqualTo(bob)
        assertThat(states.last().isLoadingStats).isFalse()
        assertThat(states.last().profileLoadFailed).isFalse()
    }

    @Test
    fun `squelette seulement a cache vide`() = runTest {
        val states = loader(FakeRemote(ok(), failure(null))).states(id, "bob")
        assertThat(states.first().isLoadingProfile).isTrue()
        assertThat(states.last().isLoadingProfile).isFalse()
    }

    @Test
    fun `panne a cache vide porte reessayer et rejouer rend la fiche`() = runTest {
        val remote = FakeRemote(failure(null, "NETWORK"), failure(null))
        val failed = loader(remote).states(id, "bob").last()
        assertThat(failed.profileLoadFailed).isTrue()
        remote.profile = ok()
        val retried = loader(remote).states(id, "bob", retry = true)
        assertThat(retried.first().profileLoadFailed).isFalse()
        assertThat(retried.last().profile).isEqualTo(bob)
    }

    @Test
    fun `panne sur fiche peinte ne remplace jamais le contenu`() = runTest {
        profiles.store(bob, id)
        val last = loader(FakeRemote(failure(null, "NETWORK"), failure(null))).states(id, "bob").last()
        assertThat(last.profile).isEqualTo(bob)
        assertThat(last.profileLoadFailed).isFalse()
    }

    @Test
    fun `403 bloque par la cible et purge profil et statistiques`() = runTest {
        profiles.store(bob, id)
        statsCache.persistStats(id, stats)
        val last = loader(FakeRemote(failure(403), failure(null))).states(id, "bob").last()
        assertThat(last.isBlockedByTarget).isTrue()
        assertThat(last.profile).isNull()
        assertThat(profiles.cachedProfile(id)).isNull()
        assertThat(profiles.cachedProfile("bob")).isNull()
        assertThat(statsCache.cachedStats(id)).isNull()
    }

    @Test
    fun `404 sur fiche peinte bloque et 404 a vide est une panne`() = runTest {
        profiles.store(bob, id)
        val painted = loader(FakeRemote(failure(404), failure(null))).states(id, "bob").last()
        assertThat(painted.isBlockedByTarget).isTrue()
        val empty = loader(FakeRemote(failure(404), failure(null))).states("64b7f0a1c2d3e4f5a6b7c8da", "x").last()
        assertThat(empty.isBlockedByTarget).isFalse()
        assertThat(empty.profileLoadFailed).isTrue()
    }

    @Test
    fun `un refus type n'offre pas de reessayer`() = runTest {
        val last = loader(FakeRemote(failure(null, "FORBIDDEN"), failure(null))).states(id, "bob").last()
        assertThat(last.profileLoadFailed).isFalse()
        assertThat(last.isBlockedByTarget).isFalse()
    }

    @Test
    fun `un effet de bord qui echoue est avale`() = runTest {
        val seen = mutableListOf<String>()
        val effects = ProfileLoadSideEffects(listOf({ error("boom") }, { seen += it.id }))
        val last = loader(FakeRemote(ok(), failure(null)), effects).states(id, "bob").last()
        assertThat(last.profile).isEqualTo(bob)
        assertThat(seen).containsExactly(id)
    }
}
