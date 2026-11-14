package me.meeshy.ui.epure

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Test
import org.w3c.dom.Element

/**
 * Épure 1/3 de la liste et du fil (#17697, épure #17584), menu des modes de lecture : les sous-titres des quatre
 * modes propres à Meeshy sont des phrases d'orientation lisibles au repos (règle 7), dites dans les sept langues,
 * au mot du réglage voisin pour le mode Rivière.
 */
class EpureModesLectureStringsTest {

    private val folders = mapOf(
        "en" to "values", "fr" to "values-fr", "es" to "values-es", "pt" to "values-pt",
        "de" to "values-de", "it" to "values-it", "ar" to "values-ar",
    )

    private val resDir = File("src/main/res")

    private fun strings(folder: String): Map<String, String> {
        val builder = DocumentBuilderFactory.newInstance().newDocumentBuilder()
        return File(resDir, folder).listFiles { f -> f.name.startsWith("strings") && f.extension == "xml" }.orEmpty()
            .flatMap { file ->
                val nodes = builder.parse(file).getElementsByTagName("string")
                (0 until nodes.length).map { nodes.item(it) as Element }
                    .map { it.getAttribute("name") to it.textContent.replace("\\'", "'") }
            }.toMap()
    }

    private val byLanguage = folders.mapValues { (_, folder) -> strings(folder) }

    private fun text(language: String, key: String): String =
        checkNotNull(byLanguage.getValue(language)[key]) { "$language : la clé $key manque" }

    private companion object {
        const val MENU_TWO_LINES = 64
    }

    private val subtitles = listOf(
        "reading_mode_focal_subtitle", "reading_mode_script_subtitle", "reading_mode_summary_subtitle", "reading_mode_river_subtitle",
    )

    @Test
    fun `le portugais est celui du Bresil, comme le reste du catalogue`() {
        subtitles.forEach { key -> assertWithMessage("pt/$key").that(text("pt", key)).doesNotContain("numa ") }
    }

    @Test
    fun `les quatre sous-titres disent ce que fait le mode, en francais`() {
        assertThat(text("fr", "reading_mode_focal_subtitle")).isEqualTo("Le message du moment est mis en avant dans la rangée.")
        assertThat(text("fr", "reading_mode_script_subtitle")).isEqualTo("Tous les messages sur une rangée plate, à densité égale.")
        assertThat(text("fr", "reading_mode_summary_subtitle")).isEqualTo("Un résumé d'abord, les messages d'origine à un tap.")
        assertThat(text("fr", "reading_mode_river_subtitle")).isEqualTo("Dans les groupes actifs, un couloir par voix.")
    }

    @Test
    fun `le mode Riviere reprend le mot du reglage voisin (settings_interface_riviere_mode_subtitle) dans chaque langue`() {
        val word = mapOf(
            "en" to "lane", "fr" to "couloir", "es" to "carril", "pt" to "faixa", "de" to "Spur", "it" to "corsia", "ar" to "مسار",
        )
        folders.keys.forEach { language ->
            assertWithMessage("$language : le sous-titre de la Rivière").that(text(language, "reading_mode_river_subtitle"))
                .contains(word.getValue(language))
        }
    }

    @Test
    fun `les sous-titres existent dans les sept langues, traduits, sans l'ancien texte`() {
        val retired = listOf("mise en scène", "densité uniforme", "la preuve", "living row", "uniform density", "proof one tap")
        subtitles.forEach { key ->
            folders.keys.forEach { language ->
                val value = text(language, key)
                assertWithMessage("$language/$key vide").that(value).isNotEmpty()
                assertWithMessage("$language/$key tient dans les deux lignes du menu").that(value.length).isAtMost(MENU_TWO_LINES)
                if (language != "fr") assertWithMessage("$language/$key copié du français").that(value).isNotEqualTo(text("fr", key))
                if (language != "fr" && language != "en") {
                    assertWithMessage("$language/$key copié de l'anglais").that(value).isNotEqualTo(text("en", key))
                }
                retired.forEach { assertWithMessage("$language/$key garde « $it »").that(value).doesNotContain(it) }
            }
        }
    }
}
