package me.meeshy.ui.appearance

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AppearanceHexColorTest {

    @Test
    fun `six digits read opaque with or without the hash`() {
        assertThat(appearanceHexColor("#6366F1")).isEqualTo(Color(0xFF6366F1.toInt()))
        assertThat(appearanceHexColor("6366f1")).isEqualTo(Color(0xFF6366F1.toInt()))
    }

    @Test
    fun `three digits expand and eight digits carry a trailing alpha`() {
        assertThat(appearanceHexColor("#F00")).isEqualTo(Color(0xFFFF0000.toInt()))
        assertThat(appearanceHexColor("#FF000080")).isEqualTo(Color(0x80FF0000.toInt()))
    }

    @Test
    fun `garbage reads black and never throws`() {
        assertThat(appearanceHexColor("nope")).isEqualTo(Color(0xFF000000.toInt()))
        assertThat(appearanceHexColor("")).isEqualTo(Color(0xFF000000.toInt()))
    }

    @Test
    fun `the tile cache renders once per key and keeps nothing for a failed render`() {
        val cache = AppearanceTileCache(capacity = 2)
        assertThat(cache.image("a") { null }).isNull()
        assertThat(cache.size).isEqualTo(0)
        cache.clear()
        assertThat(cache.size).isEqualTo(0)
    }
}
