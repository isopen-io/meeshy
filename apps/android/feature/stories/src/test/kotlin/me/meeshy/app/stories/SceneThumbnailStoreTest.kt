package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SceneThumbnailStoreTest {

    private fun store(maxBytes: Int = 4 * 1024 * 1024, maxEntries: Int = 40) =
        SlideThumbnailStore<String, Int>(maxBytes = maxBytes, maxEntries = maxEntries, sizeOf = { it })

    @Test
    fun `the shared store holds forty tiles in four megabytes`() {
        assertThat(SlideThumbnailStore.MAX_ENTRIES).isEqualTo(40)
        assertThat(SlideThumbnailStore.MAX_BYTES).isEqualTo(4 * 1024 * 1024)
    }

    @Test
    fun `the forty-first tile evicts the least recently used one`() {
        val store = store()
        (1..40).forEach { store.put("k$it", 10) }
        store.get("k1")
        store.put("k41", 10)
        assertThat(store.size).isEqualTo(40)
        assertThat(store.get("k2")).isNull()
        assertThat(store.get("k1")).isEqualTo(10)
    }

    @Test
    fun `the byte budget evicts before the count does`() {
        val store = store(maxBytes = 100)
        store.put("a", 60); store.put("b", 60)
        assertThat(store.get("a")).isNull()
        assertThat(store.get("b")).isEqualTo(60)
    }

    @Test
    fun `a tile larger than the budget is still kept alone`() {
        val store = store(maxBytes = 10)
        store.put("big", 50)
        assertThat(store.get("big")).isEqualTo(50)
    }

    @Test
    fun `clear empties the store and frees its bytes`() {
        val store = store(maxBytes = 100)
        store.put("a", 90)
        store.clear()
        store.put("b", 90)
        assertThat(store.get("a")).isNull()
        assertThat(store.get("b")).isEqualTo(90)
    }

    @Test
    fun `retainWhere drops the pictures of a removed scene and frees their bytes`() {
        val store = store(maxBytes = 100)
        store.put("gone", 60); store.put("kept", 30)
        store.retainWhere { it == "kept" }
        store.put("next", 60)
        assertThat(store.get("gone")).isNull()
        assertThat(store.get("kept")).isEqualTo(30)
        assertThat(store.get("next")).isEqualTo(60)
    }

    @Test
    fun `only a real memory squeeze purges the tiles`() {
        assertThat(SceneThumbnailPressure.purges(5)).isFalse()
        assertThat(SceneThumbnailPressure.purges(10)).isTrue()
        assertThat(SceneThumbnailPressure.purges(80)).isTrue()
    }
}
