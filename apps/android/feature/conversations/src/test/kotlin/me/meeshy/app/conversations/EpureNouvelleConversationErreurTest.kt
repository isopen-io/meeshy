package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Épure 3/3 de la liste et du fil (#17697, règle 4) : l'erreur de création d'une conversation tient en une ligne
 * (le message) plus « OK » ; son titre « Erreur » quitte l'écran, les sept langues et le manifeste.
 */
class EpureNouvelleConversationErreurTest {

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val moduleRoot: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .first { File(it, "feature/conversations/src/main/res").isDirectory }

    private val resDir = File(moduleRoot, "feature/conversations/src/main/res")

    private val pattern = Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)

    private fun all(folder: String): Map<String, String> =
        File(resDir, folder).listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            pattern.findAll(file.readText()).map { it.groupValues[1] to it.groupValues[2] }.toList()
        }.toMap()

    @Test
    fun `la boite d erreur de creation n a plus de titre et garde son message et son OK`() {
        val screen = File(moduleRoot, "feature/conversations/src/main/kotlin/me/meeshy/app/conversations/NewConversationScreen.kt").readText()
        assertThat(screen).doesNotContain("new_conversation_error_title")
        assertThat(screen).contains("new_conversation_ok")
        folders.forEach {
            assertWithMessage(it).that(all(it)).doesNotContainKey("new_conversation_error_title")
            assertWithMessage(it).that(all(it)).containsKey("new_conversation_ok")
        }
        val manifest = File(moduleRoot, "i18n/manifest").walkTopDown().filter { it.extension == "json" }.joinToString("\n") { it.readText() }
        assertThat(manifest).doesNotContain("\"androidName\": \"new_conversation_error_title\"")
    }
}
