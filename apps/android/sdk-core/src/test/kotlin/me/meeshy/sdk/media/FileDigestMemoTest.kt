package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class FileDigestMemoTest {
    @get:Rule val folder = TemporaryFolder()

    private fun file(name: String, content: String, modified: Long) =
        folder.newFile(name).apply { writeText(content); setLastModified(modified) }

    @Test
    fun `an unchanged file is hashed once`() {
        val memo = FileDigestMemo(capacity = 4)
        val f = file("a", "abc", 1_000)
        var computed = 0

        repeat(3) { memo.digest(f) { computed++; "d1" } }

        assertThat(computed).isEqualTo(1)
    }

    @Test
    fun `a file rewritten in place is hashed again`() {
        val memo = FileDigestMemo(capacity = 4)
        val f = file("a", "abc", 1_000)
        memo.digest(f) { "old" }
        f.writeText("abcd"); f.setLastModified(2_000)

        assertThat(memo.digest(f) { "new" }).isEqualTo("new")
    }

    @Test
    fun `same size, same path, other modification time invalidates`() {
        val memo = FileDigestMemo(capacity = 4)
        val f = file("a", "abc", 1_000)
        memo.digest(f) { "old" }
        f.setLastModified(5_000)

        assertThat(memo.digest(f) { "new" }).isEqualTo("new")
    }

    @Test
    fun `the memory is bounded, the eldest entry yields`() {
        val memo = FileDigestMemo(capacity = 2)
        val files = (1..3).map { file("f$it", "x$it", 1_000L) }
        files.forEach { f -> memo.digest(f) { "d-${f.name}" } }

        assertThat(memo.count).isEqualTo(2)
        var recomputed = false
        memo.digest(files[0]) { recomputed = true; "again" }
        assertThat(recomputed).isTrue()
    }
}
