package me.meeshy.sdk.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFrameLayerCacheTest {

    private fun cache(limit: Long = 100) = CallFrameLayerCache<Int>(limit) { it }

    @Test
    fun `une scene deja peinte est servie par sa cle`() {
        val cache = cache()
        cache.put("scene", 40)
        assertThat(cache.get("scene")).isEqualTo(40)
        assertThat(cache.get("autre")).isNull()
    }

    @Test
    fun `le moins recemment lu est evince le premier quand la borne est depassee`() {
        val cache = cache(100)
        cache.put("a", 40)
        cache.put("b", 40)
        cache.get("a")
        cache.put("c", 40)
        assertThat(cache.get("b")).isNull()
        assertThat(cache.get("a")).isEqualTo(40)
        assertThat(cache.get("c")).isEqualTo(40)
        assertThat(cache.totalCost).isEqualTo(80L)
    }

    @Test
    fun `une valeur plus lourde que la borne n evince personne et n est pas gardee`() {
        val cache = cache(100)
        cache.put("a", 60)
        cache.put("enorme", 101)
        assertThat(cache.get("enorme")).isNull()
        assertThat(cache.get("a")).isEqualTo(60)
    }

    @Test
    fun `remplacer une cle ne compte son poids qu une fois`() {
        val cache = cache(100)
        cache.put("a", 60)
        cache.put("a", 30)
        assertThat(cache.totalCost).isEqualTo(30L)
        assertThat(cache.size).isEqualTo(1)
    }

    @Test
    fun `la purge vide tout`() {
        val cache = cache()
        cache.put("a", 10)
        cache.put("b", 10)
        cache.purge()
        assertThat(cache.size).isEqualTo(0)
        assertThat(cache.totalCost).isEqualTo(0L)
        assertThat(cache.get("a")).isNull()
    }

    @Test
    fun `retirer une cle rend son poids`() {
        val cache = cache()
        cache.put("a", 10)
        cache.remove("a")
        cache.remove("absente")
        assertThat(cache.totalCost).isEqualTo(0L)
    }
}
