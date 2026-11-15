package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.timeline.CommandStack
import me.meeshy.sdk.model.timeline.CommandStackSnapshot
import me.meeshy.sdk.model.timeline.MoveClipCommand
import me.meeshy.sdk.model.timeline.SetSlideDurationCommand
import me.meeshy.sdk.model.timeline.TimelineClipKind
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class CommandStackStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private fun snapshot(): CommandStackSnapshot = CommandStack()
        .push(SetSlideDurationCommand(id = "a", timestamp = 0, oldDuration = 6f, newDuration = 9f))
        .push(MoveClipCommand(id = "b", timestamp = 9_000, clipId = "c", kind = TimelineClipKind.TEXT, oldStartTime = 0f, newStartTime = 2f))
        .undo()!!.stack.snapshot()

    private fun store(dir: File = File(tmp.root, "commands")) = FileCommandStackStore(dir)

    @Test
    fun `un historique ecrit se relit a l identique par une nouvelle instance`() = runTest {
        val written = snapshot()
        store().save("draft-1", written)
        val reread = store().load("draft-1")
        assertThat(reread).isEqualTo(written)
        assertThat(reread!!.cursor).isEqualTo(1)
    }

    @Test
    fun `un brouillon sans historique rend null`() = runTest {
        assertThat(store().load("none")).isNull()
    }

    @Test
    fun `un document illisible rend null et n empeche pas la reecriture`() = runTest {
        val dir = File(tmp.root, "commands").also { it.mkdirs() }
        File(dir, "d.commands.json").writeText("{ truncated")
        assertThat(store(dir).load("d")).isNull()
        store(dir).save("d", snapshot())
        assertThat(store(dir).load("d")).isEqualTo(snapshot())
    }

    @Test
    fun `clear supprime l historique et un identifiant exotique reste un nom de fichier sur`() = runTest {
        val s = store()
        s.save("../évil/id", snapshot())
        assertThat(s.load("../évil/id")).isNotNull()
        assertThat(File(tmp.root, "commands").listFiles()!!.all { it.parentFile == File(tmp.root, "commands") }).isTrue()
        s.clear("../évil/id")
        assertThat(s.load("../évil/id")).isNull()
    }

    @Test
    fun `le magasin en memoire respecte le meme contrat`() = runTest {
        val s = InMemoryCommandStackStore()
        s.save("d", snapshot())
        assertThat(s.load("d")).isEqualTo(snapshot())
        s.clear("d")
        assertThat(s.load("d")).isNull()
    }
}
