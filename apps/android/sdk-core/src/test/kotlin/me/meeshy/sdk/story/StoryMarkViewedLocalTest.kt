package me.meeshy.sdk.story

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.StoryEntity
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.IOException

/**
 * Une story vue se grise dans la barre AUSSITÔT, sans attendre la revalidation : la vue
 * est appliquée au cache des stories avant l'appel réseau, et elle tient même si
 * l'appel échoue (iOS marque la story vue localement, `StoryViewerView+Content.swift`).
 */
@RunWith(RobolectricTestRunner::class)
class StoryMarkViewedLocalTest {

    private lateinit var db: MeeshyDatabase
    private val api: StoryApi = mockk(relaxed = true)

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private fun repository() = StoryRepository(
        api, db, db.storyDao(), db.syncMetaDao(), OutboxRepository(db, db.outboxDao()), mockk(relaxed = true),
    )

    private suspend fun seed(post: ApiPost) =
        db.storyDao().upsertAll(listOf(StoryEntity(post.id, MeeshyApi.json.encodeToString(post), 1L, 1L)))

    private val unseen = ApiPost(id = "s1", type = "STORY", createdAt = "2026-10-23T10:00:00Z", isViewedByMe = false)

    @Test
    fun `a viewed story is seen in the tray cache right away`() = runTest {
        seed(unseen)
        coEvery { api.markViewed("s1") } returns ApiResponse(success = true, data = Unit)

        repository().markViewed("s1")

        assertThat(repository().cachedStories().single().isViewedByMe).isTrue()
    }

    @Test
    fun `the seen state holds when the network call fails`() = runTest {
        seed(unseen)
        coEvery { api.markViewed("s1") } throws IOException("hors ligne")

        repository().markViewed("s1")

        assertThat(repository().cachedStories().single().isViewedByMe).isTrue()
    }

    @Test
    fun `a revalidation served before the view reached the server keeps the story seen`() = runTest {
        seed(unseen)
        coEvery { api.markViewed("s1") } returns ApiResponse(success = true, data = Unit)
        coEvery { api.list(any(), any()) } returns ApiResponse(success = true, data = listOf(unseen))
        val repository = repository()
        repository.markViewed("s1")

        repository.refresh()

        assertThat(repository.cachedStories().single().isViewedByMe).isTrue()
    }
}
