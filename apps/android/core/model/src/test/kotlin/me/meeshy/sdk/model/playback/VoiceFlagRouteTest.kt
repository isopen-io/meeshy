package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VoiceFlagRouteTest {

    private fun route(code: String, text: Set<String> = emptySet(), original: String? = "en", tracks: List<String> = listOf("fr", "es")) =
        VoiceFlagRoute.route(code, textContentCodes = text, audioOriginal = original, audioTrackCodes = tracks)

    @Test
    fun `un drapeau qui porte un texte dans cette langue reste un drapeau de texte`() {
        assertThat(route("fr", text = setOf("fr"))).isEqualTo(VoiceFlagRoute.Route.Text)
    }

    @Test
    fun `un drapeau de piste sans texte selectionne la piste`() {
        assertThat(route("es")).isEqualTo(VoiceFlagRoute.Route.Audio("es"))
        assertThat(route("ES")).isEqualTo(VoiceFlagRoute.Route.Audio("es"))
    }

    @Test
    fun `la langue d'origine du vocal selectionne la piste originale`() {
        assertThat(route("EN")).isEqualTo(VoiceFlagRoute.Route.Audio(null))
    }

    @Test
    fun `un drapeau sans texte ni piste est inerte`() {
        assertThat(route("de")).isEqualTo(VoiceFlagRoute.Route.Inert)
        assertThat(route("  ")).isEqualTo(VoiceFlagRoute.Route.Inert)
    }

    @Test
    fun `sans origine ni piste un drapeau sans texte est inerte`() {
        assertThat(route("fr", original = null, tracks = emptyList())).isEqualTo(VoiceFlagRoute.Route.Inert)
    }
}
