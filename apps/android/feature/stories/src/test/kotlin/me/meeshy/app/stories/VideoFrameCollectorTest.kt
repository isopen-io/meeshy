package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Recette S8 du 2026-11-01 (#14300) : la bande « Couper » restait vide pendant que le décodeur travaillait. Chaque vignette
 * arrive dès qu'elle est décodée, une image que le premier décodage refuse passe par le repli, et ce qui est extrait se garde.
 */
class VideoFrameCollectorTest {

    @Test
    fun `chaque vignette decodee arrive aussitot, sans attendre la derniere`() {
        val partials = VideoFrameCollector.partials(listOf(1L, 2L, 3L), listOf({ at: Long -> "f$at" })).toList()

        assertThat(partials).containsExactly(listOf("f1"), listOf("f1", "f2"), listOf("f1", "f2", "f3")).inOrder()
    }

    @Test
    fun `une image refusee par le premier decodage passe par le repli`() {
        val primary = { at: Long -> if (at == 2L) null else "p$at" }
        val fallback = { at: Long -> "s$at" }

        val last = VideoFrameCollector.partials(listOf(1L, 2L, 3L), listOf(primary, fallback)).last()

        assertThat(last).containsExactly("p1", "s2", "p3").inOrder()
    }

    @Test
    fun `une image que rien ne decode est sautee, la bande garde les autres`() {
        val partials = VideoFrameCollector.partials(listOf(1L, 2L), listOf({ at: Long -> if (at == 1L) null else "f$at" })).toList()

        assertThat(partials).containsExactly(listOf("f2"))
    }

    @Test
    fun `la memoire garde les dernieres bandes et oublie la plus ancienne`() {
        val memory = BoundedMemory<String, Int>(capacity = 2)
        memory.put("a", 1)
        memory.put("b", 2)
        memory["a"]
        memory.put("c", 3)

        assertThat(memory["a"]).isEqualTo(1)
        assertThat(memory["b"]).isNull()
        assertThat(memory["c"]).isEqualTo(3)
    }
}
