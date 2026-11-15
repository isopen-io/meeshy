package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SceneCaptionResolveTest {
    private fun media(id: String, caption: String? = null, visual: Boolean = true) =
        SceneCaption.Media(id = id, isVisual = visual, caption = caption)

    private fun resolve(
        sceneIndex: Int,
        carriers: List<String?>,
        media: List<SceneCaption.Media>,
        carrierText: String? = null,
        carrierFallback: Boolean = false,
    ) = SceneCaption.resolveWithOrigin(sceneIndex, carriers, media, carrierText, carrierFallback)

    @Test
    fun `la legende est celle de la scene regardee jamais celle de la scene 0`() {
        val media = listOf(media("a", "Premiere"), media("b", "Seconde"))
        assertThat(resolve(0, listOf("a", "b"), media)?.text).isEqualTo("Premiere")
        assertThat(resolve(1, listOf("a", "b"), media)?.text).isEqualTo("Seconde")
    }

    @Test
    fun `une scene muette ne recoit pas la legende d'une autre`() {
        val media = listOf(media("a", "Premiere"))
        assertThat(resolve(1, listOf("a", null), media)).isNull()
    }

    @Test
    fun `une scene hors du document n'a pas de legende`() {
        assertThat(resolve(3, listOf("a"), listOf(media("a", "x")))).isNull()
    }

    @Test
    fun `le texte du porteur sert de repli seulement quand l'appelant l'autorise`() {
        val media = listOf(media("a"))
        val avec = resolve(0, listOf("a"), media, carrierText = " Texte ", carrierFallback = true)
        assertThat(avec).isEqualTo(SceneCaption.Resolved("Texte", SceneCaption.Origin.CarrierText))
        assertThat(resolve(0, listOf("a"), media, carrierText = "Texte", carrierFallback = false)).isNull()
    }

    @Test
    fun `la legende propre du media l'emporte sur le porteur`() {
        val r = resolve(0, listOf("a"), listOf(media("a", "Propre")), "Porteur", true)
        assertThat(r).isEqualTo(SceneCaption.Resolved("Propre", SceneCaption.Origin.MediaCaption))
    }

    @Test
    fun `un document qui n'adresse aucun media se replie sur le premier visuel`() {
        val media = listOf(media("son", "Non", visual = false), media("v", "Visuel"))
        assertThat(resolve(0, listOf(null), media)?.text).isEqualTo("Visuel")
    }

    @Test
    fun `le repli sur le premier visuel ne se joue pas scene par scene`() {
        val media = listOf(media("v", "Visuel"))
        assertThat(resolve(1, listOf("v", null), media)).isNull()
    }

    @Test
    fun `une legende blanche ne legende rien`() {
        assertThat(resolve(0, listOf("a"), listOf(media("a", "   ")))).isNull()
    }
}
