package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerAutosaveCodecTest {

    @Test
    fun `a name is stable for a source and keeps its extension`() {
        val a = ComposerAutosaveFileName.forSource("/data/cache/photo.JPG")
        assertThat(a).isEqualTo(ComposerAutosaveFileName.forSource("/data/cache//photo.JPG"))
        assertThat(a).startsWith("f-")
        assertThat(a).endsWith(".jpg")
        assertThat(ComposerAutosaveFileName.forSource("/x/noext")).endsWith(".bin")
    }

    @Test
    fun `fnv1a matches the reference vector`() {
        assertThat(ComposerAutosaveFileName.fnv1a("")).isEqualTo("cbf29ce484222325")
        assertThat(ComposerAutosaveFileName.fnv1a("a")).isEqualTo("af63dc4c8601ec8c")
    }

    @Test
    fun `a session copy keeps the name it had in the draft`() {
        val inDraft = ComposerAutosaveFileName.forSource("/data/cache/a.mp4")
        val copy = "/tmp/${ComposerAutosaveFileName.SESSION_DIRECTORY}/uuid/$inDraft"
        assertThat(ComposerAutosaveFileName.forSource(copy)).isEqualTo(inDraft)
    }

    @Test
    fun `url to name and back round-trips every restored file`() {
        val paths = listOf("/data/a.jpg", "/data/b.mp4", "/data/c.m4a")
        val (names, table) = ComposerAutosaveCodec.write(paths)
        val session = table.files.keys.associateWith { "/session/$it" }
        val back = ComposerAutosaveCodec.restore(names, session, table.aliases)
        assertThat(back).containsExactly("/data/a.jpg", "/session/${names["/data/a.jpg"]}", "/data/b.mp4", "/session/${names["/data/b.mp4"]}", "/data/c.m4a", "/session/${names["/data/c.m4a"]}")
        assertThat(table.referencedFiles).hasSize(3)
    }

    @Test
    fun `a pose copy and its attachment share one file and two addresses`() {
        val (names, table) = ComposerAutosaveCodec.write(listOf("/tmp/obj1.jpg"), copies = mapOf("/tmp/obj1.jpg" to "/pick/src.jpg"))
        assertThat(table.files).hasSize(1)
        assertThat(table.files.values.single()).isEqualTo("/pick/src.jpg")
        assertThat(table.aliases).hasSize(1)
        val session = table.files.keys.associateWith { "/session/$it" }
        val back = ComposerAutosaveCodec.restore(names, session, table.aliases)
        assertThat(back["/tmp/obj1.jpg"]).isEqualTo("/session/${table.files.keys.single()}")
    }

    @Test
    fun `a lost file drops its own entry only`() {
        val (names, table) = ComposerAutosaveCodec.write(listOf("/a.jpg", "/b.jpg"))
        val session = mapOf(names.getValue("/a.jpg") to "/session/a")
        assertThat(ComposerAutosaveCodec.restore(names, session, table.aliases)).containsExactly("/a.jpg", "/session/a")
    }
}
