package me.meeshy.sdk.profile

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.KeyedJsonCacheEntity
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserUpdatedEvent
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ProfileCacheRepositoryTest {
    private val db = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext(),
        MeeshyDatabase::class.java,
    ).allowMainThreadQueries().build()
    private val repository = ProfileCacheRepository(me.meeshy.sdk.cache.KeyedJsonCache(db.keyedJsonCacheDao()))
    private val id = "64b7f0a1c2d3e4f5a6b7c8d9"
    private val bob = MeeshyUser(id = id, username = "Bob", displayName = "Bob")

    @After
    fun tearDown() = db.close()

    @Test
    fun `ouvrir par pseudo puis par id retombe sur la meme fiche`() = runTest {
        repository.store(bob, lookupKey = "@bob", ticket = null)
        assertThat(repository.cachedProfile("bob")).isEqualTo(bob)
        assertThat(repository.cachedProfile("BOB")).isEqualTo(bob)
        assertThat(repository.cachedProfile(id)).isEqualTo(bob)
    }

    @Test
    fun `une charge corrompue est un manque de cache`() = runTest {
        db.keyedJsonCacheDao().upsert(KeyedJsonCacheEntity(ProfileCacheRepository.NAMESPACE, "bob", "{not json", 1L))
        assertThat(repository.cachedProfile("bob")).isNull()
    }

    @Test
    fun `ecrire deux fois la meme fiche laisse une ligne par cle`() = runTest {
        repository.store(bob, id, ticket = null)
        repository.store(bob, id, ticket = null)
        assertThat(db.keyedJsonCacheDao().findAll(ProfileCacheRepository.NAMESPACE)).hasSize(2)
    }

    @Test
    fun `purge retire la fiche sous toutes ses cles`() = runTest {
        repository.store(bob, "bob", ticket = null)
        repository.purge(bob, "bob")
        assertThat(db.keyedJsonCacheDao().findAll(ProfileCacheRepository.NAMESPACE)).isEmpty()
    }

    @Test
    fun `user updated repeint les lignes du compte et ignore les autres`() = runTest {
        repository.store(bob, "bob", ticket = null)
        val other = MeeshyUser(id = "64b7f0a1c2d3e4f5a6b7c8da", username = "eve")
        repository.store(other, "eve", ticket = null)
        repository.repaint(
            UserUpdatedEvent(userId = id, displayName = "Bobby", username = "Bob", hasNameGroup = true),
        )
        assertThat(repository.cachedProfile(id)?.displayName).isEqualTo("Bobby")
        assertThat(repository.cachedProfile("bob")?.displayName).isEqualTo("Bobby")
        assertThat(repository.cachedProfile("eve")).isEqualTo(other)
    }

    private val threeHoursAgo = "2026-10-29T09:00:00.000Z"
    private val bobSeen = bob.copy(isOnline = true, lastActiveAt = threeHoursAgo)

    @Test
    fun `la fiche rangee ne garde pas la presence servie`() = runTest {
        repository.store(bobSeen, id, ticket = null)
        val rows = db.keyedJsonCacheDao().findAll(ProfileCacheRepository.NAMESPACE)
        assertThat(rows).isNotEmpty()
        rows.forEach { row ->
            assertThat(row.payload).doesNotContain(threeHoursAgo)
            assertThat(row.payload).contains("\"isOnline\":null")
            assertThat(row.payload).contains("\"lastActiveAt\":null")
        }
        assertThat(repository.cachedProfile(id)).isEqualTo(bob)
    }

    @Test
    fun `une fiche deja en cache avec sa presence est lue sans elle`() = runTest {
        val legacy = kotlinx.serialization.json.Json.encodeToString(MeeshyUser.serializer(), bobSeen)
        assertThat(legacy).contains(threeHoursAgo)
        listOf(id, "bob").forEach { db.keyedJsonCacheDao().upsert(KeyedJsonCacheEntity(ProfileCacheRepository.NAMESPACE, it, legacy, 1L)) }
        listOf(id, "bob", "@Bob").forEach { key ->
            val read = repository.cachedProfile(key)
            assertThat(read?.isOnline).isNull()
            assertThat(read?.lastActiveAt).isNull()
            assertThat(read?.displayName).isEqualTo("Bob")
        }
    }

    @Test
    fun `la deconnexion vide profile_card`() = runTest {
        repository.store(bob, "bob", ticket = null)
        db.clearAllTables()
        assertThat(repository.cachedProfile("bob")).isNull()
        assertThat(repository.cachedProfile(id)).isNull()
    }
}
