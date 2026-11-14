package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Épure 3/3 de la liste et du fil (#17697, règle 4) : la boîte « action refusée » des membres tient en une ligne
 * (le message) plus l'action « OK » ; son titre « Erreur » quitte l'écran, les sept langues et le manifeste.
 */
class EpureFilLot5StringsTest {

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val moduleRoot: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .first { File(it, "feature/chat/src/main/res").isDirectory }

    private val resDir = File(moduleRoot, "feature/chat/src/main/res")

    private val pattern = Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)

    private fun all(folder: String): Map<String, String> =
        File(resDir, folder).listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            pattern.findAll(file.readText()).map { it.groupValues[1] to it.groupValues[2] }.toList()
        }.toMap()

    @Test
    fun `la boite action refusee des membres n a plus de titre et garde son message et son OK`() {
        val sheet = File(moduleRoot, "feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMembersSheet.kt").readText()
        assertThat(sheet).doesNotContain("members_sheet_error_title")
        assertThat(sheet).contains("conversation_members_action_failed")
        assertThat(sheet).contains("members_sheet_error_ok")
        folders.forEach {
            assertWithMessage(it).that(all(it)).doesNotContainKey("members_sheet_error_title")
            assertWithMessage(it).that(all(it)).containsKey("members_sheet_error_ok")
            assertWithMessage(it).that(all(it)).containsKey("conversation_members_action_failed")
        }
        val manifest = File(moduleRoot, "i18n/manifest").walkTopDown().filter { it.extension == "json" }.joinToString("\n") { it.readText() }
        assertThat(manifest).doesNotContain("\"androidName\": \"members_sheet_error_title\"")
    }
}
