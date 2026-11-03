package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftAnnotations
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.model.StoryDraftTextElementSnapshot
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class StoryDraftStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val json = Json { ignoreUnknownKeys = true }
    private var now = 1_000L

    private fun store(filesDir: File = tmp.newFolder()) =
        StoryDraftDiskStore(filesDir, tmp.newFolder(), json) { now++ }

    private fun snap(
        text: String = "bonjour",
        mediaIds: List<String> = emptyList(),
        editing: String? = null,
        annotations: StoryDraftAnnotations = StoryDraftAnnotations(),
    ) = StoryComposerDraftSnapshot(
        slides = listOf(
            StoryDraftSlideSnapshot(
                id = "s1",
                text = "",
                mediaIds = mediaIds,
                background = "#112233",
                elements = listOf(StoryDraftTextElementSnapshot(id = "t1", text = text)),
            ),
        ),
        selectedId = "s1",
        annotations = annotations,
        editingPostId = editing,
    )

    private fun file(name: String, body: String = "x") = tmp.newFile(name).apply { writeText(body) }

    @Test
    fun `two drafts sharing an element id keep their own media`() {
        val s = store()
        s.save("a", snap(mediaIds = listOf("m")), mapOf("f.jpg" to file("a.jpg", "A")))
        s.save("b", snap(mediaIds = listOf("m")), mapOf("f.jpg" to file("b.jpg", "B")))

        assertThat(s.load("a")!!.sessionFileByName.getValue("f.jpg").readText()).isEqualTo("A")
        assertThat(s.load("b")!!.sessionFileByName.getValue("f.jpg").readText()).isEqualTo("B")
        assertThat(s.listDrafts()).hasSize(2)
    }

    @Test
    fun `the summary reads title cover and background without loading the draft`() {
        val s = store()
        s.save("a", snap(text = "  salut  "), mapOf("f-1.jpg" to file("a.jpg")), thumbHash = "th")

        val summary = s.listDrafts().single()
        assertThat(summary.title).isEqualTo("salut")
        assertThat(summary.backgroundHex).isEqualTo("#112233")
        assertThat(summary.thumbHash).isEqualTo("th")
        assertThat(summary.slideCount).isEqualTo(1)
        assertThat(summary.coverFilePath).endsWith("f-1.jpg")
    }

    @Test
    fun `the cover is the first image still on disk`() {
        val s = store()
        s.save("a", snap(), mapOf("f-1.jpg" to file("a.jpg"), "f-2.jpg" to file("b.jpg")))
        val first = File(s.listDrafts().single().coverFilePath!!)
        first.delete()

        assertThat(s.listDrafts().single().coverFilePath).endsWith("f-2.jpg")
    }

    @Test
    fun `drafts are listed newest first`() {
        val s = store()
        s.save("old", snap(), emptyMap())
        s.save("new", snap(), emptyMap())

        assertThat(s.listDrafts().map { it.id }).containsExactly("new", "old").inOrder()
    }

    @Test
    fun `a publication freezes the draft, a failure thaws it with its error, a retry clears the error`() {
        val s = store()
        s.save("a", snap(), emptyMap())

        s.markPendingPublish("a", 5_000L)
        assertThat(s.listDrafts().single().isFrozen).isTrue()

        s.recordPublishFailure("a", "boom")
        val failed = s.listDrafts().single()
        assertThat(failed.isFrozen).isFalse()
        assertThat(failed.lastPublishError).isEqualTo("boom")

        s.markPendingPublish("a", 6_000L)
        assertThat(s.listDrafts().single().lastPublishError).isNull()
        s.clearPendingPublish("a")
        assertThat(s.listDrafts().single().isFrozen).isFalse()
    }

    @Test
    fun `a re-save keeps the freeze and the editing link is served lightly`() {
        val s = store()
        s.save("a", snap(editing = "post9"), emptyMap())
        s.markPendingPublish("a", 5_000L)
        s.save("a", snap(text = "autre", editing = "post9"), emptyMap())

        assertThat(s.listDrafts().single().isFrozen).isTrue()
        assertThat(s.draftEditingPostId("a")).isEqualTo("post9")
    }

    @Test
    fun `accessibility, captions and history survive the round trip`() {
        val s = store()
        val annotations = StoryDraftAnnotations(mediaAlt = mapOf("m" to "un chat"), mediaCaption = mapOf("m" to "Minou"), allowSoundExtraction = true)
        s.save("a", snap(mediaIds = listOf("m"), annotations = annotations), emptyMap())
        s.saveCommandHistory("a", byteArrayOf(1, 2, 3))

        assertThat(s.load("a")!!.snapshot.annotations).isEqualTo(annotations)
        assertThat(s.loadCommandHistory("a")).isEqualTo(byteArrayOf(1, 2, 3))
    }

    @Test
    fun `purging lost media removes them and their descriptions`() {
        val s = store()
        val annotations = StoryDraftAnnotations(mediaAlt = mapOf("m" to "x", "n" to "y"))
        s.save("a", snap(mediaIds = listOf("m", "n"), annotations = annotations), emptyMap())
        s.purgeLostMedia("a", setOf("m"))

        val restored = s.load("a")!!.snapshot
        assertThat(restored.slides.single().mediaIds).containsExactly("n")
        assertThat(restored.annotations.mediaAlt.keys).containsExactly("n")
    }

    @Test
    fun `a failed write on a never written draft is told apart from one that was written`() {
        val blocker = tmp.newFile("blocker")
        val broken = StoryDraftDiskStore(blocker, tmp.newFolder(), json) { now++ }
        assertThat(broken.save("a", snap(), emptyMap())).isFalse()
        assertThat(broken.lastPersistFailure!!.draftWasEverWritten).isFalse()

        val dir = tmp.newFolder()
        val s = store(dir)
        s.save("a", snap(), emptyMap())
        File(dir, "StoryDrafts/a/media").deleteRecursively()
        File(dir, "StoryDrafts/a/media").writeText("not a directory")
        assertThat(s.save("a", snap(text = "v2"), emptyMap())).isFalse()
        assertThat(s.lastPersistFailure!!.draftWasEverWritten).isTrue()
        s.clearPersistFailure()
        assertThat(s.lastPersistFailure).isNull()
    }

    @Test
    fun `deleting one draft leaves the others`() {
        val s = store()
        s.save("a", snap(), emptyMap())
        s.save("b", snap(), emptyMap())
        s.delete("a")

        assertThat(s.listDrafts().map { it.id }).containsExactly("b")
        assertThat(s.isEmpty()).isFalse()
        s.clear()
        assertThat(s.isEmpty()).isTrue()
    }

    @Test
    fun `an id that names no draft never reaches the other drafts`() {
        val s = store()
        s.save("a", snap(), emptyMap())

        assertThat(s.delete("..")).isFalse()
        assertThat(s.delete("")).isFalse()
        assertThat(s.save("", snap(), emptyMap())).isFalse()
        assertThat(s.save("../a", snap(), emptyMap())).isFalse()
        assertThat(s.listDrafts().map { it.id }).containsExactly("a")
    }

    @Test
    fun `a media name cannot leave the draft directory`() {
        val dir = tmp.newFolder()
        val s = store(dir)

        assertThat(s.save("a", snap(), mapOf("../evil.jpg" to file("e.jpg")))).isFalse()
        assertThat(File(dir, "StoryDrafts/a/evil.jpg").exists()).isFalse()
    }

    @Test
    fun `the stored snapshot and media names are read without copying the media`() {
        val sessions = tmp.newFolder()
        val s = StoryDraftDiskStore(tmp.newFolder(), sessions, json) { now++ }
        s.save("a", snap(mediaIds = listOf("m")), mapOf("m.jpg" to file("m.jpg")))

        assertThat(s.peek("a")).isEqualTo(snap(mediaIds = listOf("m")))
        assertThat(s.mediaNames("a")).containsExactly("m.jpg")
        assertThat(sessions.walkTopDown().filter { it.isFile }.toList()).isEmpty()
    }
}
