package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AvatarRingChoiceTest {

    private fun ring(key: String): AvatarRingDesign =
        AvatarRingDesign(key = key, stroke = AvatarRingStroke(style = RingStrokeStyle.SOLID, width = 0.04, colors = listOf("#FF0000")))

    private val equipped = ring("equipe")
    private val explicit = ring("choisi")

    @Test
    fun `une personne sans contour choisi par l'hote porte le contour qu'elle a equipe`() {
        assertThat(AvatarRingChoice.effective(explicit = null, equipped = equipped, isUser = true)).isEqualTo(equipped)
    }

    @Test
    fun `une entite ne porte jamais le contour equipe d'une personne`() {
        assertThat(AvatarRingChoice.effective(explicit = null, equipped = equipped, isUser = false)).isNull()
    }

    @Test
    fun `le contour deja resolu par l'hote prime sur le contour equipe`() {
        assertThat(AvatarRingChoice.effective(explicit = explicit, equipped = equipped, isUser = true)).isEqualTo(explicit)
    }

    @Test
    fun `le contour resolu par l'hote reste pose meme sur une entite`() {
        assertThat(AvatarRingChoice.effective(explicit = explicit, equipped = null, isUser = false)).isEqualTo(explicit)
    }

    @Test
    fun `sans contour equipe ni choisi aucun contour ne se pose`() {
        assertThat(AvatarRingChoice.effective(explicit = null, equipped = null, isUser = true)).isNull()
    }
}
