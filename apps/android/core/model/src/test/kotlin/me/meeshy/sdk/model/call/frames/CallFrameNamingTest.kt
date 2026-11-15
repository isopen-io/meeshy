package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.montage.CallMontageFrameRule
import org.junit.Test

/**
 * LE NOM D'UN CADRE D'APPEL DANS LA LANGUE D'INTERFACE (#13953) — miroir de `frameDisplayName`
 * (`packages/shared/types/frame-name.ts`) et d'iOS `CallFrameNaming` : chaque cadre et chaque déclinaison
 * se nomme dans les sept langues, `name` (le français d'avant) en repli.
 */
class CallFrameNamingTest {
    private val languages = listOf("fr", "en", "es", "pt", "de", "it", "ar")

    @Test
    fun `chaque cadre et chaque declinaison a un nom dans les sept langues, le francais etant le nom d'avant`() {
        val named = CallFrameCatalogue.all.flatMap { frame ->
            listOf(Triple(frame.id, frame.name, frame.localizedNames)) +
                frame.styles.map { Triple("${frame.id}.${it.id}", it.name, it.localizedNames) }
        }
        val missing = named.flatMap { (id, _, names) -> languages.filter { names[it].isNullOrBlank() }.map { "$id:$it" } }
        assertThat(missing).isEmpty()
        assertThat(named.filter { (_, name, names) -> names["fr"] != name }.map { it.first }).isEmpty()
    }

    @Test
    fun `le nom sert la langue d'interface, son code court ou regional, et retombe sur name`() {
        val fete = CallFrameCatalogue.all.first { it.id == "jovial.fete.duo" }
        assertThat(fete.displayName("en")).isEqualTo("Party")
        assertThat(fete.displayName("pt-BR")).isEqualTo("Festa")
        assertThat(fete.displayName("ar")).isEqualTo("حفلة")
        assertThat(fete.displayName("ja")).isEqualTo("Fête")
        assertThat(fete.displayName(null)).isEqualTo("Fête")
        assertThat(fete.copy(localizedNames = emptyMap()).displayName("en")).isEqualTo("Fête")
        val relief = fete.styles.first()
        assertThat(relief.displayName("it")).isEqualTo("Rilievo")
        assertThat(CallFrameStyleRule.styled(fete, relief).displayName("es")).isEqualTo("Fiesta")
    }

    @Test
    fun `le carrousel du montage nomme le cadre et sa declinaison dans la langue d'interface`() {
        val fete = CallFrameCatalogue.all.first { it.id == "jovial.fete.duo" }
        val relief = fete.styles.first()
        assertThat(CallMontageFrameRule.frameName(fete.id, language = "en")).isEqualTo("Party")
        assertThat(CallMontageFrameRule.frameName("${fete.id}.${relief.id}", language = "es")).isEqualTo("Fiesta · Relieve")
        assertThat(CallMontageFrameRule.frameName(fete.id)).isEqualTo("Fête")
    }
}
