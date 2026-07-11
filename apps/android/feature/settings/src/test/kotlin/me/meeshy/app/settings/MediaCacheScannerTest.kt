package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * Behavioural spec for [MediaCacheScanner], exercised against real temp directories: recursive
 * size measurement (including nested folders and the missing-directory case) and content wiping
 * that keeps the directory but removes everything beneath it.
 */
class MediaCacheScannerTest {

    @get:Rule
    val temp = TemporaryFolder()

    private fun write(path: File, bytes: Int) {
        path.parentFile?.mkdirs()
        path.writeBytes(ByteArray(bytes))
    }

    @Test
    fun sizeOf_missingDirectory_isZero() {
        val missing = File(temp.root, "does-not-exist")

        assertThat(MediaCacheScanner.sizeOf(missing)).isEqualTo(0L)
    }

    @Test
    fun sizeOf_emptyDirectory_isZero() {
        val dir = temp.newFolder("empty")

        assertThat(MediaCacheScanner.sizeOf(dir)).isEqualTo(0L)
    }

    @Test
    fun sizeOf_sumsEveryRegularFile() {
        val dir = temp.newFolder("cache")
        write(File(dir, "a.bin"), 100)
        write(File(dir, "b.bin"), 250)

        assertThat(MediaCacheScanner.sizeOf(dir)).isEqualTo(350L)
    }

    @Test
    fun sizeOf_recursesIntoNestedDirectories() {
        val dir = temp.newFolder("cache")
        write(File(dir, "top.bin"), 10)
        write(File(dir, "nested/deep/leaf.bin"), 40)

        assertThat(MediaCacheScanner.sizeOf(dir)).isEqualTo(50L)
    }

    @Test
    fun clear_missingDirectory_isInert() {
        val missing = File(temp.root, "nope")

        MediaCacheScanner.clear(missing) // must not throw

        assertThat(missing.exists()).isFalse()
    }

    @Test
    fun clear_removesContentsButKeepsTheDirectory() {
        val dir = temp.newFolder("cache")
        write(File(dir, "a.bin"), 100)
        write(File(dir, "nested/b.bin"), 100)

        MediaCacheScanner.clear(dir)

        assertThat(dir.exists()).isTrue()
        assertThat(dir.listFiles()).isEmpty()
        assertThat(MediaCacheScanner.sizeOf(dir)).isEqualTo(0L)
    }
}
