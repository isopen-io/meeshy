package me.meeshy.sdk.post

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.story.DataStoreStoryComposerDraftStore
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** #13430 — « Reprendre votre brouillon » follows the durable drafts live, in memory and on disk. */
class ComposerDraftsObservationTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }
    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    private val post = PostComposerDraftSnapshot(text = "salut")
    private val story = StoryComposerDraftSnapshot(
        slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "yo")),
        selectedId = "s1",
    )

    @Test
    fun `the post editing draft is announced when saved and when erased`() = runTest {
        val store = InMemoryPostComposerDraftStore()

        store.observeEditing().test {
            assertThat(awaitItem()).isNull()
            store.saveEditing(post)
            assertThat(awaitItem()).isEqualTo(post)
            store.clearEditing()
            assertThat(awaitItem()).isNull()
        }
    }

    @Test
    fun `parking a post for publication empties the editing draft the feed shows`() = runTest {
        val store = InMemoryPostComposerDraftStore(editing = post)

        store.observeEditing().test {
            assertThat(awaitItem()).isEqualTo(post)
            store.park("cmid_1", post)
            assertThat(awaitItem()).isNull()
        }
    }

    @Test
    fun `the durable post store follows its own writes`() = runTest(dataStores.dispatcher) {
        val store = DataStorePostComposerDraftStore(dataStores.preferences(tmp.newFile("p1.preferences_pb")), json)

        store.observeEditing().test {
            assertThat(awaitItem()).isNull()
            store.saveEditing(post)
            assertThat(awaitItem()).isEqualTo(post)
        }
    }

    @Test
    fun `the story draft is announced when saved and when erased`() = runTest {
        val store = InMemoryStoryComposerDraftStore()

        store.observe().test {
            assertThat(awaitItem()).isNull()
            store.save(story)
            assertThat(awaitItem()).isEqualTo(story)
            store.clear()
            assertThat(awaitItem()).isNull()
        }
    }

    @Test
    fun `the durable story store follows its own writes`() = runTest(dataStores.dispatcher) {
        val store = DataStoreStoryComposerDraftStore(dataStores.preferences(tmp.newFile("s1.preferences_pb")), json)

        store.observe().test {
            assertThat(awaitItem()).isNull()
            store.save(story)
            assertThat(awaitItem()).isEqualTo(story)
        }
    }
}
