package me.meeshy.app.widget.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class WidgetAvatarCacheTest {

    @Test
    fun `key combines initials accent size and presence`() {
        val key = WidgetAvatarKey.of(name = "marie curie", accentHex = "#6366f1", sizeDp = 40, presence = "online")
        assertThat(key).isEqualTo(WidgetAvatarKey("MC", "6366F1", 40, "online"))
    }

    @Test
    fun `an unknown presence token is treated as offline`() {
        assertThat(WidgetAvatarKey.of("A", "6366F1", 40, "bogus").presence).isEqualTo("offline")
        assertThat(WidgetAvatarKey.of("A", "6366F1", 40, null).presence).isEqualTo("offline")
    }

    @Test
    fun `get returns the stored value and creates only once`() {
        val cache = WidgetAvatarCache<String>(capacity = 2)
        var created = 0
        val key = WidgetAvatarKey("A", "6366F1", 40, "offline")
        repeat(3) { cache.getOrPut(key) { created++; "bmp" } }
        assertThat(created).isEqualTo(1)
    }

    @Test
    fun `least recently used entry is evicted beyond capacity`() {
        val cache = WidgetAvatarCache<String>(capacity = 2)
        val a = WidgetAvatarKey("A", "000000", 24, "offline")
        val b = WidgetAvatarKey("B", "000000", 24, "offline")
        val c = WidgetAvatarKey("C", "000000", 24, "offline")
        cache.getOrPut(a) { "a" }
        cache.getOrPut(b) { "b" }
        cache.getOrPut(a) { "a2" }
        cache.getOrPut(c) { "c" }
        assertThat(cache.size).isEqualTo(2)
        assertThat(cache.peek(b)).isNull()
        assertThat(cache.peek(a)).isEqualTo("a")
        assertThat(cache.peek(c)).isEqualTo("c")
    }
}
