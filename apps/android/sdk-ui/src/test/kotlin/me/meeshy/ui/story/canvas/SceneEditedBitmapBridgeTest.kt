package me.meeshy.ui.story.canvas

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SceneEditedBitmapBridgeTest {

    @Test
    fun `une image jamais retouchee garde son adresse pour cle`() {
        val bridge = SceneEditedBitmapBridge()
        assertThat(bridge.versionOf("file:///a.jpg")).isEqualTo(0L)
        assertThat(bridge.cacheKey("file:///a.jpg")).isEqualTo("file:///a.jpg")
    }

    @Test
    fun `chaque retouche donne un cookie strictement plus grand meme sur une autre adresse`() {
        val bridge = SceneEditedBitmapBridge()
        val first = bridge.invalidate("a")
        val second = bridge.invalidate("b")
        val third = bridge.invalidate("a")
        assertThat(listOf(first, second, third)).isInOrder()
        assertThat(third).isGreaterThan(second)
        assertThat(bridge.versionOf("a")).isEqualTo(third)
    }

    @Test
    fun `la cle de cache change a chaque retouche alors que l adresse reste constante`() {
        val bridge = SceneEditedBitmapBridge()
        val before = bridge.cacheKey("a")
        bridge.invalidate("a")
        val once = bridge.cacheKey("a")
        bridge.invalidate("a")
        assertThat(setOf(before, once, bridge.cacheKey("a"))).hasSize(3)
        assertThat(bridge.cacheKey("a")).startsWith("a")
    }

    @Test
    fun `l ancienne cle est retiree du cache et celle d une autre adresse reste`() {
        val evicted = mutableListOf<String>()
        val bridge = SceneEditedBitmapBridge(evict = evicted::add)
        bridge.invalidate("a")
        val current = bridge.cacheKey("a")
        bridge.invalidate("a")
        assertThat(evicted).containsExactly("a", current).inOrder()
        assertThat(bridge.cacheKey("b")).isEqualTo("b")
    }
}
