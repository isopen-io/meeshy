package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.store.CacheCursorStore
import me.meeshy.sdk.cache.store.CacheStoreRegistry
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.MemberRosterPage
import me.meeshy.sdk.model.PaginatedParticipant
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ParticipantsCacheSourceTest {
    private val db = inMemoryDatabase()
    private val clock = FakeClock()
    private val registry = CacheStoreRegistry(Dispatchers.Unconfined)
    private val source = ParticipantsCacheSource(
        registry.roomStore(
            db.cacheEntryDao(), ParticipantsCacheSource.NAMESPACE, CachePolicy.Participants,
            PaginatedParticipant.serializer(), { it.id }, clock = clock,
        ),
        CacheCursorStore(db.cacheEntryDao(), ParticipantsCacheSource.NAMESPACE),
    )

    @After fun tearDown() = db.close()

    private fun member(id: String, online: Boolean? = null) = PaginatedParticipant(id = id, isOnline = online)

    private fun page(vararg ids: String, next: String? = null, more: Boolean = next != null) =
        MemberRosterPage(ids.map { member(it) }, nextCursor = next, hasMore = more)

    @Test
    fun `la premiere page et son curseur survivent a un redemarrage a froid`() = runTest {
        source.replaceFirstPage("c1", page("a", "b", next = "cur-1"), null)

        val cached = source.cached("c1")!!
        assertThat(cached.members.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(cached.nextCursor).isEqualTo("cur-1")
        assertThat(cached.hasMore).isTrue()
    }

    @Test
    fun `une page suivante s ajoute sans doublon et avance le curseur`() = runTest {
        source.replaceFirstPage("c1", page("a", "b", next = "cur-1"), null)
        source.appendPage("c1", page("b", "c", next = "cur-2"), null)
        source.appendPage("c1", page("d", next = null, more = false), null)

        val cached = source.cached("c1")!!
        assertThat(cached.members.map { it.id }).containsExactly("a", "b", "c", "d").inOrder()
        assertThat(cached.nextCursor).isNull()
        assertThat(cached.hasMore).isFalse()
    }

    @Test
    fun `une page suivante ne rend pas la liste faussement fraiche`() = runTest {
        source.replaceFirstPage("c1", page("a", next = "cur-1"), null)
        clock.now += 10 * 60_000L
        source.appendPage("c1", page("b", next = null), null)

        val first = source.results("c1") { page("a", "b") }.first()

        assertThat(first).isInstanceOf(CacheResult.Stale::class.java)
    }

    @Test
    fun `une page suivante sans premiere page n invente pas de liste`() = runTest {
        source.appendPage("c1", page("x", next = "cur"), null)

        assertThat(source.cached("c1")).isNull()
    }

    @Test
    fun `la presence servie n est ni rangee ni restituee`() = runTest {
        source.replaceFirstPage("c1", MemberRosterPage(listOf(member("a", online = true))), null)

        assertThat(source.cached("c1")!!.members.single().isOnline).isNull()
    }

    @Test
    fun `chaque conversation a sa liste et son curseur`() = runTest {
        source.replaceFirstPage("c1", page("a", next = "n1"), null)
        source.replaceFirstPage("c2", page("z", next = "n2"), null)

        assertThat(source.cached("c1")!!.nextCursor).isEqualTo("n1")
        assertThat(source.cached("c2")!!.members.map { it.id }).containsExactly("z")
    }
}
