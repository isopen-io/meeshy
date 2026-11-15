package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.session.DefaultSessionTeardown
import org.junit.Test

class InMemoryMyStoriesArchiveCacheTest {

    @Test
    fun `la deconnexion oublie les stories du compte precedent`() = runTest {
        val cache = InMemoryMyStoriesArchiveCache()
        cache.write(listOf(ApiPost(id = "s1")))

        DefaultSessionTeardown(
            database = mockk(relaxed = true),
            categorySnapshotStore = mockk(relaxed = true),
            conversationDraftStore = mockk(relaxed = true),
            conversationLockStore = mockk(relaxed = true),
            storyComposerDraftStore = mockk(relaxed = true),
            friendshipCache = mockk(relaxed = true),
            notificationRepository = mockk(relaxed = true),
            blockCache = mockk(relaxed = true),
            perAccountCaches = setOf(cache),
        ).wipe()

        assertThat(cache.read()).isNull()
    }
}
