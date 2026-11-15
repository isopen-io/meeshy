package me.meeshy.sdk.model.mediacache

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LruEvictionPlanTest {
    private fun file(key: String, size: Long, access: Long) = CachedFileInfo(key, size, access)
    private val files = listOf(file("new", 40, 300), file("old", 40, 100), file("mid", 40, 200))

    @Test
    fun `sous le budget rien n'est evince`() {
        assertThat(LruEvictionPlan.victims(files, 120, MediaPinTable(), 0)).isEmpty()
    }

    @Test
    fun `les plus anciens partent d'abord jusqu'au budget`() {
        assertThat(LruEvictionPlan.victims(files, 80, MediaPinTable(), 0)).containsExactly("old")
        assertThat(LruEvictionPlan.victims(files, 40, MediaPinTable(), 0)).containsExactly("old", "mid").inOrder()
    }

    @Test
    fun `une epingle active et un telechargement en cours sont proteges`() {
        val pins = MediaPinTable().pin("old", 1_000)
        val victims = LruEvictionPlan.victims(files, 40, pins, 0, inFlightKeys = setOf("mid"))
        assertThat(victims).containsExactly("new")
    }

    @Test
    fun `une epingle echue ne protege plus`() {
        val pins = MediaPinTable().pin("old", 50)
        assertThat(LruEvictionPlan.victims(files, 80, pins, 50)).containsExactly("old")
    }

    @Test
    fun `les egalites sont departagees par la cle`() {
        val tied = listOf(file("b", 10, 1), file("a", 10, 1))
        assertThat(LruEvictionPlan.victims(tied, 10, MediaPinTable(), 0)).containsExactly("a")
    }

    @Test
    fun `tout protege laisse le plan incomplet`() {
        val pins = files.fold(MediaPinTable()) { t, f -> t.pin(f.key, 1_000) }
        assertThat(LruEvictionPlan.victims(files, 0, pins, 0)).isEmpty()
    }
}
