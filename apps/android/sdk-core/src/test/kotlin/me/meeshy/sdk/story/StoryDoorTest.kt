package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.StoryViewerInitialAction
import me.meeshy.sdk.model.StoryViewerRequest
import org.junit.Test

class StoryDoorTest {
    private class FakeTray(
        val groups: MutableMap<String, String> = mutableMapOf(),
        val loadable: Map<String, String> = emptyMap(),
    ) : StoryTrayResolving {
        var loads = 0
        override fun groupId(storyId: String): String? = groups[storyId]
        override suspend fun ensureStoryLoaded(postId: String): Boolean {
            loads++
            val group = loadable[postId] ?: return false
            groups[postId] = group
            return true
        }
    }

    private class FakeViewer : StoryViewerPresenting {
        val requests = mutableListOf<StoryViewerRequest>()
        override fun present(request: StoryViewerRequest) {
            requests += request
        }
    }

    private suspend fun open(tray: FakeTray, viewer: FakeViewer = FakeViewer()): Pair<FakeViewer, Int> {
        var details = 0
        StoryDoor(tray, viewer).open("s1", StoryViewerInitialAction.COMMENTS, "c2", "c1") { details++ }
        return viewer to details
    }

    @Test
    fun `une story du plateau s ouvre sur elle avec son postId et la cible`() = runTest {
        val tray = FakeTray(groups = mutableMapOf("s1" to "u9"))
        val (viewer, details) = open(tray)
        assertThat(tray.loads).isEqualTo(0)
        assertThat(details).isEqualTo(0)
        assertThat(viewer.requests).containsExactly(
            StoryViewerRequest.targetingStory("s1", "u9", false, StoryViewerInitialAction.COMMENTS, "c2", "c1"),
        )
    }

    @Test
    fun `une story ignoree du plateau est chargee puis ouverte avec son postId`() = runTest {
        val tray = FakeTray(loadable = mapOf("s1" to "u9"))
        val (viewer, details) = open(tray)
        assertThat(tray.loads).isEqualTo(1)
        assertThat(details).isEqualTo(0)
        assertThat(viewer.requests.single().postId).isEqualTo("s1")
        assertThat(viewer.requests.single().groupId).isEqualTo("u9")
    }

    @Test
    fun `une story morte retombe sur le detail du post`() = runTest {
        val (viewer, details) = open(FakeTray())
        assertThat(viewer.requests).isEmpty()
        assertThat(details).isEqualTo(1)
    }
}
