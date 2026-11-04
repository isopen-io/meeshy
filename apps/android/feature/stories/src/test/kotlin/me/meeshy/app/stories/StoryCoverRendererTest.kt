package me.meeshy.app.stories

import android.graphics.Bitmap
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.story.StoryCoverStore
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class StoryCoverRendererTest {

    private class FakeStore(private val accepts: Boolean = true) : StoryCoverStore {
        val written = mutableMapOf<String, ByteArray>()
        override fun localPath(id: String): String? = written[id]?.let { "/covers/$id.jpg" }
        override suspend fun store(id: String, bytes: ByteArray): Boolean = accepts.also { if (it) written[id] = bytes }
        override suspend fun remove(id: String) { written.remove(id) }
    }

    private fun bitmap() = Bitmap.createBitmap(27, 48, Bitmap.Config.ARGB_8888)

    private fun renderer(store: StoryCoverStore, memo: StoryCoverMemo = StoryCoverMemo()) =
        StoryCoverRenderer(store, StoryCoverRenderSignal(memo))

    @Test
    fun `une couverture rendue est ecrite sous l'id et annoncee`() = runTest {
        val store = FakeStore()
        val renderer = renderer(store)
        assertThat(renderer.write("s1") { bitmap() }).isTrue()
        assertThat(store.written["s1"]).isNotEmpty()
    }

    @Test
    fun `un rendu qui echoue n'ecrit rien et ne leve pas`() = runTest {
        val store = FakeStore()
        assertThat(renderer(store).write("s1") { error("boom") }).isFalse()
        assertThat(store.written).isEmpty()
    }

    @Test
    fun `sans bitmap, pas de couverture`() = runTest {
        val store = FakeStore()
        assertThat(renderer(store).write("s1") { null }).isFalse()
        assertThat(store.written).isEmpty()
    }

    @Test
    fun `un disque qui refuse l'ecriture ne leve pas`() = runTest {
        assertThat(renderer(FakeStore(accepts = false)).write("s1") { bitmap() }).isFalse()
    }

    @Test
    fun `le brouillon sauvegarde ecrit la couverture de sa premiere diapo`() = runTest {
        val store = FakeStore()
        val renderer = renderer(store)
        renderer.source = StoryDraftCoverSource { bitmap() }
        renderer.onDraftSaved(StoryComposerDraftSnapshot(slides = listOf(StoryDraftSlideSnapshot(id = "slide-1"))))
        assertThat(store.written.keys).containsExactly("slide-1")
    }

    @Test
    fun `sans hote de rendu, la sauvegarde du brouillon ne fait rien`() = runTest {
        val store = FakeStore()
        renderer(store).onDraftSaved(StoryComposerDraftSnapshot(slides = listOf(StoryDraftSlideSnapshot(id = "slide-1"))))
        assertThat(store.written).isEmpty()
    }
}
