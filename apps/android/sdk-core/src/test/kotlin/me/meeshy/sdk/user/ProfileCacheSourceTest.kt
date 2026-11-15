package me.meeshy.sdk.user

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.store.CacheStoreRegistry
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.MeeshyUser
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ProfileCacheSourceTest {
    private val db = inMemoryDatabase()
    private val clock = FakeClock()
    private val registry = CacheStoreRegistry(Dispatchers.Unconfined)
    private val source = ProfileCacheSource(
        registry.roomStore(
            db.cacheEntryDao(), ProfileCacheSource.NAMESPACE, CachePolicy.Profiles, MeeshyUser.serializer(), { it.id },
            clock = clock,
        ),
    )

    @After fun tearDown() = db.close()

    private fun user(id: String, name: String = "u$id", online: Boolean? = null, active: String? = null) =
        MeeshyUser(id = id, username = name, isOnline = online, lastActiveAt = active)

    @Test
    fun `une fiche se relit par son id ou par son pseudo`() = runTest {
        source.remember(user("1", "Bob"), null)

        assertThat(source.cached("1")?.username).isEqualTo("Bob")
        assertThat(source.cached("@bob")?.id).isEqualTo("1")
        assertThat(source.cached("nobody")).isNull()
    }

    @Test
    fun `la presence servie n est ni rangee ni restituee`() = runTest {
        source.remember(user("1", online = true, active = "2026-11-04T10:00:00Z"), null)

        val cached = source.cached("1")!!
        assertThat(cached.isOnline).isNull()
        assertThat(cached.lastActiveAt).isNull()
    }

    @Test
    fun `le cache ne garde que les 100 profils les plus recents`() = runTest {
        (1..105).forEach { source.remember(user("$it"), null) }

        assertThat(source.cached("105")).isNotNull()
        assertThat(source.cached("6")).isNotNull()
        assertThat(source.cached("5")).isNull()
        assertThat(source.cached("1")).isNull()
    }

    @Test
    fun `revoir un profil le remonte en tete et le sauve de l eviction`() = runTest {
        (1..100).forEach { source.remember(user("$it"), null) }
        source.remember(user("1"), null)
        source.remember(user("101"), null)

        assertThat(source.cached("1")).isNotNull()
        assertThat(source.cached("2")).isNull()
    }

    @Test
    fun `un profil perime est servi puis revalide en silence`() = runTest {
        source.remember(user("1", "Old"), null)
        clock.now += 10 * 60_000L

        val emissions = source.results("1") { user("1", "New") }.take(2).toList()

        assertThat(emissions[0]).isInstanceOf(CacheResult.Stale::class.java)
        assertThat((emissions[0] as CacheResult.Stale).value.username).isEqualTo("Old")
        assertThat((emissions.last() as CacheResult.Fresh).value.username).isEqualTo("New")
    }

    @Test
    fun `hors ligne le profil perime reste affiche`() = runTest {
        source.remember(user("1", "Old"), null)
        clock.now += 10 * 60_000L

        val first = source.results("1") { error("offline") }.first()

        assertThat((first as CacheResult.Stale).value.username).isEqualTo("Old")
    }

    @Test
    fun `un profil frais ne touche pas le reseau`() = runTest {
        source.remember(user("1"), null)
        var fetched = 0

        val first = source.results("1") { fetched++; user("1") }.first()

        assertThat(first).isInstanceOf(CacheResult.Fresh::class.java)
        assertThat(fetched).isEqualTo(0)
    }

    @Test
    fun `a froid le profil est Empty puis servi apres le reseau`() = runTest {
        val emissions = source.results("1") { user("1") }.take(2).toList()

        assertThat(emissions[0]).isEqualTo(CacheResult.Empty)
        assertThat(emissions[1]).isInstanceOf(CacheResult.Fresh::class.java)
    }
}
