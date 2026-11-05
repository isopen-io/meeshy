package me.meeshy.sdk.call.frames

import android.content.ComponentCallbacks2
import android.graphics.Bitmap
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class CallFrameThumbnailCacheTest {

    private fun bitmap(side: Int = 10) = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888)

    @Test
    fun `une vignette rangee est rendue pour sa cle cadre x personnes x taille, et pour elle seule`() {
        val cache = CallFrameThumbnailCache()
        val thumb = bitmap()
        cache.store(thumb, "f1", 2, 48, 85)
        assertThat(cache.image("f1", 2, 48, 85)).isSameInstanceAs(thumb)
        assertThat(cache.image("f1", 3, 48, 85)).isNull()
        assertThat(cache.image("f1", 2, 96, 170)).isNull()
        assertThat(cache.image("f2", 2, 48, 85)).isNull()
    }

    @Test
    fun `le cache ne grandit pas avec le catalogue, le nombre de vignettes est borne`() {
        val cache = CallFrameThumbnailCache(countLimit = 3, costLimit = 3 * 400)
        (1..10).forEach { cache.store(bitmap(), "f$it", 1, 10, 10) }
        assertThat(cache.size).isAtMost(3)
        assertThat(cache.image("f10", 1, 10, 10)).isNotNull()
        assertThat(cache.image("f1", 1, 10, 10)).isNull()
    }

    @Test
    fun `le poids total est borne en octets, la moins recemment lue part la premiere`() {
        val cache = CallFrameThumbnailCache(countLimit = 48, costLimit = 1000)
        cache.store(bitmap(10), "a", 1, 10, 10)
        cache.store(bitmap(10), "b", 1, 10, 10)
        cache.image("a", 1, 10, 10)
        cache.store(bitmap(10), "c", 1, 10, 10)
        assertThat(cache.image("b", 1, 10, 10)).isNull()
        assertThat(cache.image("a", 1, 10, 10)).isNotNull()
    }

    @Test
    fun `une vignette plus lourde que la borne n est pas gardee`() {
        val cache = CallFrameThumbnailCache(countLimit = 2, costLimit = 100)
        cache.store(bitmap(10), "gros", 1, 10, 10)
        assertThat(cache.size).isEqualTo(0)
    }

    @Test
    fun `la pression memoire purge le cache, un simple rappel de memoire ne le purge pas`() {
        val cache = CallFrameThumbnailCache()
        cache.store(bitmap(), "f1", 1, 10, 10)
        cache.trimMemory(ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN)
        assertThat(cache.size).isEqualTo(1)
        cache.trimMemory(ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW)
        assertThat(cache.size).isEqualTo(0)
    }

    @Test
    fun `removeAll vide tout`() {
        val cache = CallFrameThumbnailCache()
        cache.store(bitmap(), "f1", 1, 10, 10)
        cache.removeAll()
        assertThat(cache.image("f1", 1, 10, 10)).isNull()
    }
}
