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
    private val repository = ProfileCacheRepository(db.keyedJsonCacheDao())
    private val id = "64b7f0a1c2d3e4f5a6b7c8d9"
    private val bob = MeeshyUser(id = id, username = "Bob", displayName = "Bob")

    @After
    fun tearDown() = db.close()

    @Test
    fun `ouvrir par pseudo puis par id retombe sur la meme fiche`() = runTest {
        repository.store(bob, lookupKey = "@bob")
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
        repository.store(bob, id)
        repository.store(bob, id)
        assertThat(db.keyedJsonCacheDao().findAll(ProfileCacheRepository.NAMESPACE)).hasSize(2)
    }

    @Test
    fun `purge retire la fiche sous toutes ses cles`() = runTest {
        repository.store(bob, "bob")
        repository.purge(bob, "bob")
        assertThat(db.keyedJsonCacheDao().findAll(ProfileCacheRepository.NAMESPACE)).isEmpty()
    }

    @Test
    fun `user updated repeint les lignes du compte et ignore les autres`() = runTest {
        repository.store(bob, "bob")
        val other = MeeshyUser(id = "64b7f0a1c2d3e4f5a6b7c8da", username = "eve")
        repository.store(other, "eve")
        repository.repaint(
            UserUpdatedEvent(userId = id, displayName = "Bobby", username = "Bob", hasNameGroup = true),
        )
        assertThat(repository.cachedProfile(id)?.displayName).isEqualTo("Bobby")
        assertThat(repository.cachedProfile("bob")?.displayName).isEqualTo("Bobby")
        assertThat(repository.cachedProfile("eve")).isEqualTo(other)
    }

    @Test
    fun `la deconnexion vide profile_card`() = runTest {
        repository.store(bob, "bob")
        db.clearAllTables()
        assertThat(repository.cachedProfile("bob")).isNull()
        assertThat(repository.cachedProfile(id)).isNull()
    }
}
