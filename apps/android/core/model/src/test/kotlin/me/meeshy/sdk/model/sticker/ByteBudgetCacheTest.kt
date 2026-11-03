package me.meeshy.sdk.model.sticker

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ByteBudgetCacheTest {
    private fun cache(max: Long = 100) = ByteBudgetCache<String, Int>(max) { it.toLong() }

    @Test
    fun `le total ne dépasse jamais le budget`() {
        val c = cache()
        (1..20).forEach { c.put("k$it", 30) }
        assertThat(c.sizeBytes).isAtMost(100L)
        assertThat(c.count).isEqualTo(3)
    }

    @Test
    fun `la plus anciennement servie est évincée en premier`() {
        val c = cache()
        c.put("a", 40)
        c.put("b", 40)
        c.get("a")
        c.put("c", 40)
        assertThat(c["b"]).isNull()
        assertThat(c["a"]).isEqualTo(40)
        assertThat(c["c"]).isEqualTo(40)
    }

    @Test
    fun `une entrée plus grosse que le budget n'entre pas`() {
        val c = cache()
        c.put("a", 10)
        c.put("a", 500)
        assertThat(c["a"]).isNull()
        assertThat(c.sizeBytes).isEqualTo(0L)
    }

    @Test
    fun `remplacer une clé corrige le total`() {
        val c = cache()
        c.put("a", 40)
        c.put("a", 10)
        assertThat(c.sizeBytes).isEqualTo(10L)
    }

    @Test
    fun `libérer une entrée rend ses octets`() {
        val c = cache()
        c.put("a", 40)
        assertThat(c.remove("a")).isEqualTo(40)
        assertThat(c.sizeBytes).isEqualTo(0L)
    }
}
