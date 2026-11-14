package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Épure 3/3 du fil (#17697, épure #17584) : la carte de la flamme (propre à Meeshy) dit ce que sont ses nombres
 * SANS rien ouvrir (règle 7), et la note de la police de l'export passe derrière un (i) dont le nom est une question.
 */
class EpureFilLot3StringsTest {

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val moduleRoot: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .first { File(it, "feature/chat/src/main/res").isDirectory }

    private val resDir = File(moduleRoot, "feature/chat/src/main/res")
    private val sources = File(moduleRoot, "feature/chat/src/main/kotlin/me/meeshy/app/chat")

    private val pattern = Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)

    private fun unescape(raw: String) = raw.replace("\\'", "'").replace("&amp;", "&")

    private fun all(folder: String): Map<String, String> =
        File(resDir, folder).listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            pattern.findAll(file.readText()).map { it.groupValues[1] to unescape(it.groupValues[2]) }.toList()
        }.toMap()

    private val flameKeys = listOf("chat_header_flame_card_orientation", "chat_header_flame_card_today_sparks", "chat_header_flame_card_total_sparks")
    private val removedFlame = listOf("chat_header_flame_card_today", "chat_header_flame_card_total")
    private val exportKeys = listOf("export_card_typeface_pairs", "export_card_typeface_pairs_question")

    @Test
    fun `the flame card names its unit and orients itself in plain text, no info icon`() {
        val card = File(sources, "ChatHeaderFlameCard.kt").readText()
        flameKeys.forEach { assertThat(card).contains("R.string.$it") }
        removedFlame.forEach { assertThat(card).doesNotContain("R.string.$it)") }
        assertThat(card).doesNotContain("InfoNote")
        val en = all("values")
        assertThat(en["chat_header_flame_card_orientation"]).isEqualTo("Sparks earned by writing in this conversation")
        assertThat(en["chat_header_flame_card_today_sparks"]).isEqualTo("Sparks today")
        assertThat(en["chat_header_flame_card_total_sparks"]).isEqualTo("Sparks in total")
        assertThat(all("values-fr")["chat_header_flame_card_orientation"]).contains("étincelles")
    }

    @Test
    fun `the flame strings exist in the seven languages, translated and never copied from French`() {
        val french = all("values-fr")
        flameKeys.forEach { key ->
            folders.forEach { assertWithMessage("$key dans $it").that(all(it)[key]).isNotEmpty() }
            folders.filterNot { it == "values-fr" }.forEach {
                assertWithMessage("$key recopié du français dans $it").that(all(it)[key]).isNotEqualTo(french[key])
            }
        }
    }

    @Test
    fun `the two flame labels with no reader left are gone from the seven folders and the manifest`() {
        folders.forEach { folder ->
            assertWithMessage("clés sans lecteur dans $folder").that(removedFlame.filter { it in all(folder).keys }).isEmpty()
        }
        val manifest = File(moduleRoot, "i18n/manifest").walkTopDown().filter { it.extension == "json" }.joinToString("\n") { it.readText() }
        removedFlame.forEach { assertThat(manifest).doesNotContain("\"androidName\": \"$it\"") }
    }

    @Test
    fun `the export font note sits behind an info icon named by its question, in the seven languages`() {
        val tray = File(sources, "export/CardExportTray.kt").readText()
        assertThat(tray).contains("MeeshyInfoNote")
        assertThat(tray).contains("R.string.export_card_typeface_pairs_question")
        assertThat(tray).doesNotContain("maxLines = 2")
        assertThat(all("values")["export_card_typeface_pairs_question"]).isEqualTo("What does the font apply to?")
        assertThat(all("values")["export_card_typeface_pairs"]).isEqualTo("The font dresses both the quote and the reply")
        val french = all("values-fr")
        exportKeys.forEach { key ->
            folders.forEach { assertWithMessage("$key dans $it").that(all(it)[key]).isNotEmpty() }
            folders.filterNot { it == "values-fr" }.forEach {
                assertWithMessage("$key recopié du français dans $it").that(all(it)[key]).isNotEqualTo(french[key])
            }
        }
        folders.forEach { assertThat(all(it).getValue("export_card_typeface_pairs_question")).endsWith(if (it == "values-ar") "؟" else "?") }
    }
}
