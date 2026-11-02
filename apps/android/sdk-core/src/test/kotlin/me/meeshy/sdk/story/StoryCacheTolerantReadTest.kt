package me.meeshy.sdk.story

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.StoryEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Une ligne du cache des stories qui ne se relit plus (écrite par une version antérieure,
 * tronquée) ne coûte qu'ELLE-MÊME. Le flux de la barre décodait toutes les lignes d'un
 * bloc : une seule ligne illisible faisait lever le flux, l'exception sortait du
 * collecteur de la barre, et l'app se fermait à l'affichage des stories.
 */
@RunWith(RobolectricTestRunner::class)
class StoryCacheTolerantReadTest {

    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private fun repository() = StoryRepository(
        mockk(relaxed = true), db, db.storyDao(), db.syncMetaDao(), OutboxRepository(db, db.outboxDao()), mockk(relaxed = true),
    )

    private fun row(id: String, payload: String) = StoryEntity(id = id, payload = payload, createdAt = 1L, cachedAt = 1L)

    private suspend fun seed(vararg rows: StoryEntity) {
        db.storyDao().upsertAll(rows.toList())
        db.syncMetaDao().upsert(SyncMetaEntity("stories", System.currentTimeMillis()))
    }

    private val readable = ApiPost(id = "ok", type = "STORY", createdAt = "2026-10-23T10:00:00Z")

    @Test
    fun `an unreadable cached story is skipped and the others still paint`() = runTest {
        seed(row("ok", MeeshyApi.json.encodeToString(readable)), row("broken", """{"type":"STORY""""))

        val first = repository().storiesStream(CachePolicy.Stories).first()

        assertThat(first).isInstanceOf(CacheResult.Fresh::class.java)
        assertThat((first as CacheResult.Fresh).value.map { it.id }).containsExactly("ok")
    }

    @Test
    fun `a realtime update on an unreadable cached story is inert`() = runTest {
        seed(row("broken", "{"))

        val applied = repository().applyStoryUpdate(readable.copy(id = "broken"), engagementReset = false, currentUserId = null)

        assertThat(applied).isFalse()
    }
}
