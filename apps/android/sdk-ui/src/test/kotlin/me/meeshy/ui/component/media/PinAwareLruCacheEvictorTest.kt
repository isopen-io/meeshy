package me.meeshy.ui.component.media

import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.cache.Cache
import androidx.media3.datasource.cache.CacheSpan
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import me.meeshy.sdk.model.mediacache.MediaPinTable
import org.junit.Test

@UnstableApi
class PinAwareLruCacheEvictorTest {
    private class Harness(
        maxBytes: Long,
        pins: MediaPinTable = MediaPinTable(),
        inFlight: Set<String> = emptySet(),
        now: Long = 1_000L,
    ) {
        val removed = mutableListOf<String>()
        val evictor = PinAwareLruCacheEvictor(maxBytes, { pins }, { inFlight }, { now })
        val cache: Cache = mockk(relaxed = true)

        init {
            every { cache.removeSpan(any()) } answers {
                val span = firstArg<CacheSpan>()
                removed += span.key
                evictor.onSpanRemoved(cache, span)
            }
        }

        fun add(key: String, position: Long, length: Long, touched: Long): CacheSpan =
            CacheSpan(key, position, length, touched, null).also { evictor.onSpanAdded(cache, it) }
    }

    @Test
    fun `sous le budget rien n'est evince`() {
        val h = Harness(maxBytes = 100)
        h.add("a", 0, 40, touched = 1)
        h.add("b", 0, 40, touched = 2)
        assertThat(h.removed).isEmpty()
    }

    @Test
    fun `la ressource la moins recemment touchee part en entier en premier`() {
        val h = Harness(maxBytes = 100)
        h.add("old", 0, 30, touched = 1)
        h.add("old", 30, 30, touched = 2)
        h.add("new", 0, 30, touched = 50)
        h.add("new", 30, 30, touched = 60)
        assertThat(h.removed).containsExactly("old", "old")
    }

    @Test
    fun `une epingle active n'est jamais evincee meme si elle est la plus ancienne`() {
        val h = Harness(maxBytes = 100, pins = MediaPinTable().pin("pinned", untilEpochMillis = 5_000))
        h.add("pinned", 0, 60, touched = 1)
        h.add("other", 0, 60, touched = 2)
        assertThat(h.removed).containsExactly("other")
    }

    @Test
    fun `une epingle echue redevient evincable`() {
        val h = Harness(maxBytes = 100, pins = MediaPinTable().pin("pinned", untilEpochMillis = 500), now = 1_000)
        h.add("pinned", 0, 60, touched = 1)
        h.add("other", 0, 60, touched = 2)
        assertThat(h.removed).containsExactly("pinned")
    }

    @Test
    fun `une ressource en cours de lecture n'est jamais evincee`() {
        val h = Harness(maxBytes = 100, inFlight = setOf("playing"))
        h.add("playing", 0, 60, touched = 1)
        h.add("other", 0, 60, touched = 2)
        assertThat(h.removed).containsExactly("other")
    }

    @Test
    fun `tout protege le cache depasse sans rien evincer`() {
        val h = Harness(maxBytes = 50, inFlight = setOf("a", "b"))
        h.add("a", 0, 60, touched = 1)
        h.add("b", 0, 60, touched = 2)
        assertThat(h.removed).isEmpty()
    }

    @Test
    fun `une ecriture qui va depasser fait de la place avant de commencer`() {
        val h = Harness(maxBytes = 100)
        h.add("old", 0, 60, touched = 1)
        h.add("keep", 0, 30, touched = 5)
        h.evictor.onStartFile(h.cache, "incoming", 0, 40)
        assertThat(h.removed).containsExactly("old")
    }

    @Test
    fun `une ecriture de longueur inconnue ne declenche pas d'eviction`() {
        val h = Harness(maxBytes = 10)
        h.evictor.onStartFile(h.cache, "incoming", 0, C.LENGTH_UNSET.toLong())
        assertThat(h.removed).isEmpty()
    }

    @Test
    fun `toucher un troncon le rend recent`() {
        val h = Harness(maxBytes = 100)
        val a = h.add("a", 0, 40, touched = 1)
        h.add("b", 0, 40, touched = 2)
        h.evictor.onSpanTouched(h.cache, a, CacheSpan("a", 0, 40, 99, null))
        h.add("c", 0, 40, touched = 3)
        assertThat(h.removed).containsExactly("b")
    }
}
