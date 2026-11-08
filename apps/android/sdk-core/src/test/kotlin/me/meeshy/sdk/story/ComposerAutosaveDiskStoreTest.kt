package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.model.composer.ComposerAutosaveAccount
import me.meeshy.sdk.model.composer.ComposerAutosaveSlot
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ComposerAutosaveDiskStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val json = Json { ignoreUnknownKeys = true }
    private val account = ComposerAutosaveAccount.of("u1", "https://gate.meeshy.me")!!
    private val other = ComposerAutosaveAccount.of("u1", "https://gate.staging.meeshy.me")!!

    private fun store() = ComposerAutosaveDiskStore(tmp.newFolder(), tmp.newFolder(), json)
    private fun snap(text: String = "x") =
        StoryComposerDraftSnapshot(slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = text)), selectedId = "s1")

    @Test
    fun `a draft reads back with its media copied out of the drawer`() {
        val s = store()
        val src = tmp.newFile("a.jpg").apply { writeText("bytes") }
        s.save(account, ComposerAutosaveSlot.CREATION, snap(), mapOf("f-1.jpg" to src))
        val restored = s.load(account, ComposerAutosaveSlot.CREATION)!!
        assertThat(restored.snapshot.slides.single().text).isEqualTo("x")
        assertThat(restored.sessionFileByName.getValue("f-1.jpg").readText()).isEqualTo("bytes")
    }

    @Test
    fun `a draft is never served outside the account and environment that wrote it`() {
        val s = store()
        s.save(account, ComposerAutosaveSlot.CREATION, snap(), emptyMap())
        assertThat(s.hasDraft(other, ComposerAutosaveSlot.CREATION)).isFalse()
        assertThat(s.load(other, ComposerAutosaveSlot.CREATION)).isNull()
    }

    @Test
    fun `a media removed from the creation leaves the disk after the snapshot`() {
        val s = store()
        val a = tmp.newFile("a").apply { writeText("a") }
        val b = tmp.newFile("b").apply { writeText("b") }
        s.save(account, ComposerAutosaveSlot.CREATION, snap(), mapOf("f-a" to a, "f-b" to b))
        s.save(account, ComposerAutosaveSlot.CREATION, snap(), mapOf("f-a" to a))
        assertThat(s.load(account, ComposerAutosaveSlot.CREATION)!!.sessionFileByName.keys).containsExactly("f-a")
    }

    @Test
    fun `parking moves the whole drawer under the publication slot`() {
        val s = store()
        s.save(account, ComposerAutosaveSlot.CREATION, snap("p"), emptyMap())
        val parked = ComposerAutosaveSlot.publication("cm1")
        s.move(account, ComposerAutosaveSlot.CREATION, parked)
        assertThat(s.hasDraft(account, ComposerAutosaveSlot.CREATION)).isFalse()
        assertThat(s.publicationSlots(account)).containsExactly(parked)
        assertThat(s.load(account, parked)!!.snapshot.slides.single().text).isEqualTo("p")
    }

    @Test
    fun `a corrupt snapshot reads as no draft and delete clears the drawer`() {
        val filesDir = tmp.newFolder()
        val s = ComposerAutosaveDiskStore(filesDir, tmp.newFolder(), json)
        s.save(account, ComposerAutosaveSlot.CREATION, snap(), emptyMap())
        val file = File(File(File(File(filesDir, "ComposerAutosave"), account.directoryName), "creation"), "snapshot.json")
        file.writeText("{not json")
        assertThat(s.load(account, ComposerAutosaveSlot.CREATION)).isNull()
        s.delete(account, ComposerAutosaveSlot.CREATION)
        assertThat(s.hasDraft(account, ComposerAutosaveSlot.CREATION)).isFalse()
    }
}
