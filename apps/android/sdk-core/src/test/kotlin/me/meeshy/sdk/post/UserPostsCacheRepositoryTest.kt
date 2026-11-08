package me.meeshy.sdk.post

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.ProfileStatsCacheEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiPost
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class UserPostsCacheRepositoryTest {

    private lateinit var db: MeeshyDatabase
    private var now = 1_000_000_000L

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private fun repository() = UserPostsCacheRepository(db.profileStatsCacheDao(), object : CacheClock {
        override fun nowMillis(): Long = now
    })

    private fun post(id: String) = ApiPost(id = id)

    @Test
    fun `une personne jamais vue est un manque`() = runTest {
        assertThat(repository().cached("u1")).isEqualTo(CacheResult.Empty)
    }

    @Test
    fun `les publications reviennent avec leur curseur, frais puis perime puis expire`() = runTest {
        val repo = repository()
        repo.persist("u1", UserPostsSnapshot(listOf(post("p1")), nextCursor = "c1", hasMore = true), ticket = null)

        val fresh = repo.cached("u1")
        assertThat(fresh).isInstanceOf(CacheResult.Fresh::class.java)
        assertThat((fresh as CacheResult.Fresh).value.posts.map { it.id }).containsExactly("p1")
        assertThat(fresh.value.nextCursor).isEqualTo("c1")

        now += 10 * 60_000L
        assertThat(repo.cached("u1")).isInstanceOf(CacheResult.Stale::class.java)

        now += 8L * 24 * 3_600_000L
        assertThat(repo.cached("u1")).isInstanceOf(CacheResult.Syncing::class.java)
    }

    @Test
    fun `la cle est par auteur`() = runTest {
        val repo = repository()
        repo.persist("u1", UserPostsSnapshot(listOf(post("p1"))), ticket = null)
        assertThat(repo.cached("u2")).isEqualTo(CacheResult.Empty)
        assertThat(db.profileStatsCacheDao().observe("profile_posts:u1").let { true }).isTrue()
    }

    @Test
    fun `une charge corrompue vaut un manque`() = runTest {
        db.profileStatsCacheDao().upsert(ProfileStatsCacheEntity("profile_posts:u1", "{pas du json", now))
        assertThat(repository().cached("u1")).isEqualTo(CacheResult.Empty)
    }

    @Test
    fun `seules les cent plus recentes sont gardees`() = runTest {
        val repo = repository()
        repo.persist("u1", UserPostsSnapshot((1..130).map { post("p$it") }), ticket = null)
        val cached = repo.cached("u1") as CacheResult.Fresh
        assertThat(cached.value.posts).hasSize(100)
        assertThat(cached.value.posts.first().id).isEqualTo("p1")
    }
}
