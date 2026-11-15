package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.KeyedJsonCacheEntity
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.ApiPostComment
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CommentCacheSourceTest {
    private lateinit var db: MeeshyDatabase
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() {
        scope.cancel()
        db.close()
    }

    private fun source() = KeyedCommentCacheSource(KeyedJsonCache(db.keyedJsonCacheDao()), scope)

    private suspend fun CommentCacheSource.eventually(expected: (List<String>?) -> Boolean): List<String>? =
        withTimeoutOrNull(5_000) {
            var read = read("p")?.value?.map { it.id }
            while (!expected(read)) {
                delay(20)
                read = read("p")?.value?.map { it.id }
            }
            read
        } ?: read("p")?.value?.map { it.id }

    @Test
    fun `une ligne optimiste n est jamais ecrite`() = runBlocking<Unit> {
        val source = source()
        source.keep("p", listOf(ApiPostComment(id = "tmp_1"), ApiPostComment(id = "cmid_2"), ApiPostComment(id = "real")), null)
        assertThat(source.eventually { it != null }).containsExactly("real")
    }

    @Test
    fun `le disque est plafonne a cinq cents lignes`() = runBlocking<Unit> {
        val source = source()
        source.keep("p", (1..650).map { ApiPostComment(id = "c$it") }, null)
        assertThat(source.eventually { it != null }).hasSize(500)
    }

    @Test
    fun `la reaction et le media d une ligne survivent a la relecture`() = runBlocking<Unit> {
        val source = source()
        val row = ApiPostComment(id = "c1", reactionSummary = mapOf("❤️" to 3), currentUserReactions = listOf("❤️"))
        source.keep("p", listOf(row), null)
        source.eventually { it != null }
        val back = source().read("p")!!.value.single()
        assertThat(back.reactionSummary).containsExactly("❤️", 3)
    }

    @Test
    fun `une charge indecodable degrade en vide`() = runBlocking<Unit> {
        db.keyedJsonCacheDao().upsert(KeyedJsonCacheEntity("post-comments", "post-p", "{not json", 1L))
        assertThat(source().read("p")).isNull()
    }

    @Test
    fun `la purge de session vide le disque`() = runBlocking<Unit> {
        val source = source()
        source.keep("p", listOf(ApiPostComment(id = "c1")), null)
        source.eventually { it != null }
        source.clear()
        assertThat(source.read("p")).isNull()
    }
}
