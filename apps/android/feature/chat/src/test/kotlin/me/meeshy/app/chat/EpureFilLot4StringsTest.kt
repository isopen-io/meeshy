package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Épure 1/3 de la liste et du fil, reprise (#17697, épure #17584) : le fait « chiffré sur nos serveurs » ne redit plus
 * la liste des fonctions (la section Disponible la dit une fois), et les clés `reading_mode_*` dupliquées de :sdk-ui
 * — seules celles de :sdk-ui sont lues — quittent le module et son manifeste.
 */
class EpureFilLot4StringsTest {

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val moduleRoot: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .first { File(it, "feature/chat/src/main/res").isDirectory }

    private val resDir = File(moduleRoot, "feature/chat/src/main/res")

    private val pattern = Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)

    private fun unescape(raw: String) = raw.replace("\\'", "'").replace("&amp;", "&")

    private fun all(folder: String): Map<String, String> =
        File(resDir, folder).listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            pattern.findAll(file.readText()).map { it.groupValues[1] to unescape(it.groupValues[2]) }.toList()
        }.toMap()

    private val serverFact = "encryption_fact_encrypted_on_server_server_reads"

    @Test
    fun `le fait chiffre sur nos serveurs tient en une phrase et ne redit pas la liste des fonctions`() {
        assertThat(all("values-fr")[serverFact]).isEqualTo("Vos messages sont chiffrés sur nos serveurs.")
        assertThat(all("values")[serverFact]).isEqualTo("Your messages are encrypted on our servers.")
        assertThat(all("values")["encryption_fact_every_server_feature"]).contains("automatic translation")
        folders.forEach { folder ->
            val fact = all(folder).getValue(serverFact)
            assertWithMessage("$folder : une seule phrase").that(fact.count { it == '.' }).isEqualTo(1)
            assertWithMessage("$folder : la liste des fonctions vit dans Disponible")
                .that(all(folder).getValue("encryption_fact_every_server_feature").length).isGreaterThan(fact.length)
        }
        folders.filterNot { it == "values-fr" }.forEach {
            assertWithMessage("$it recopié du français").that(all(it)[serverFact]).isNotEqualTo(all("values-fr")[serverFact])
        }
    }

    @Test
    fun `les cles reading_mode de feature chat, doublons de sdk-ui, quittent les sept langues et le manifeste`() {
        folders.forEach { folder ->
            assertWithMessage("reading_mode_* dans $folder").that(all(folder).keys.filter { it.startsWith("reading_mode_") }).isEmpty()
        }
        val manifest = File(moduleRoot, "i18n/manifest/chat.d").walkTopDown().filter { it.extension == "json" }.joinToString("\n") { it.readText() }
        assertThat(manifest).doesNotContain("\"androidName\": \"reading_mode_")
        assertThat(File(moduleRoot, "i18n/manifest/chat.json").readText()).doesNotContain("\"androidName\": \"reading_mode_")
    }
}
