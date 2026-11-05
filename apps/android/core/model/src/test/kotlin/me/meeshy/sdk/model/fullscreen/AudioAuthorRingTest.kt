package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.ServedProfileDecorItem
import org.junit.Test

class AudioAuthorRingTest {

    private fun ring(item: String) = ServedProfileDecorItem(pack = "contours-animes", item = item, origin = PackOrigin.BUILTIN)

    private val onde = ring("onde")
    private val aurore = ring("aurore")

    @Test
    fun `le contour servi avec la page prime`() {
        assertThat(AudioAuthorRing.elect("nour", onde, mapOf("nour" to aurore))).isEqualTo(onde)
    }

    @Test
    fun `sans contour servi la page reprend celui que le fil a servi pour le meme auteur`() {
        assertThat(AudioAuthorRing.elect("nour", null, mapOf("nour" to aurore, "lina" to onde))).isEqualTo(aurore)
    }

    @Test
    fun `un auteur que le fil n a pas servi n emprunte jamais le contour d un autre`() {
        assertThat(AudioAuthorRing.elect("sam", null, mapOf("nour" to aurore, "lina" to onde))).isNull()
    }

    @Test
    fun `un auteur sans identifiant ne reprend rien`() {
        assertThat(AudioAuthorRing.elect(null, null, mapOf("" to aurore))).isNull()
        assertThat(AudioAuthorRing.elect("", null, mapOf("" to aurore))).isNull()
    }

    @Test
    fun `un auteur sans identifiant garde le contour qu on lui a servi`() {
        assertThat(AudioAuthorRing.elect(null, onde, emptyMap())).isEqualTo(onde)
    }
}
