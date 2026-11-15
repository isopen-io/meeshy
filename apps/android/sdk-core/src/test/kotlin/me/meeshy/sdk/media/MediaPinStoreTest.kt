package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.mediacache.MediaCacheKey
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class MediaPinStoreTest {
    @get:Rule val folder = TemporaryFolder()

    private fun store(now: Long) = MediaPinStore(folder.root, clock = { now })

    @Test
    fun `une epingle survit au redemarrage`() = runTest {
        store(now = 10).pin("https://x.me/a.jpg", untilEpochMillis = 1_000)
        val reborn = store(now = 500)
        assertThat(reborn.isPinned("https://x.me/a.jpg")).isTrue()
        assertThat(reborn.snapshot().expiries.keys).containsExactly(MediaCacheKey.of("https://x.me/a.jpg"))
    }

    @Test
    fun `une epingle echue n'est plus active et est elaguee du sidecar`() = runTest {
        store(now = 10).pin("u", untilEpochMillis = 100)
        val later = store(now = 100)
        assertThat(later.isPinned("u")).isFalse()
        assertThat(later.snapshot().expiries).isEmpty()
        assertThat(store(now = 0).snapshot().expiries).isEmpty()
    }

    @Test
    fun `unpin retire durablement et un sidecar illisible repart vide`() = runTest {
        val first = store(now = 0)
        first.pin("u", 100)
        first.unpin("u")
        assertThat(store(now = 0).isPinned("u")).isFalse()
        java.io.File(folder.root, ".pins.json").writeText("{corrompu")
        assertThat(store(now = 0).snapshot().expiries).isEmpty()
    }
}
