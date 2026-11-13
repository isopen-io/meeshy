package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * L'épure du profil : le détail ne redit pas le chiffrement, la demande envoyée tient en une ligne.
 * Un libellé nomme ; ce qui n'a plus de lecteur quitte les sept dossiers dans le même commit ; ce qui est raccourci
 * est traduit, jamais recopié du français (#18083, épure #17584).
 */
class EpureProfileStringsTest {

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val resDir: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .map { File(it, "feature/profile/src/main/res") }
        .first { it.isDirectory }

    private val pattern = Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)

    private fun unescape(raw: String) = raw.replace("\\'", "'").replace("&amp;", "&")

    private fun all(folder: String): Map<String, String> =
        File(resDir, folder).listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            pattern.findAll(file.readText()).map { it.groupValues[1] to unescape(it.groupValues[2]) }.toList()
        }.toMap()

    private fun epure(folder: String): Map<String, String> {
        val file = File(resDir, "$folder/strings_epure_android.xml")
        assertWithMessage("$folder/strings_epure_android.xml").that(file.isFile).isTrue()
        return pattern.findAll(file.readText()).associate { it.groupValues[1] to unescape(it.groupValues[2]) }
    }

    private fun specifiers(text: String) = Regex("""%(\d+)\$[sd]""").findAll(text).map { it.value }.sorted().toList()

    private val removed = listOf(
        "profile_e2ee_enabled",
        "profile_regional_language_label",
        "profile_custom_language_label",
        "profile_avatar",
        "profile_report",
        "profile_block_failed",
        "profile_unblock_failed",
        "profile_block_entry",
        "profile_unblock_entry",
        "profile_block_entry_a11y",
        "profile_unblock_entry_a11y",
        "profile_action_unblock_user",
        "profile_presence_away",
        "profile_presence_online",
        "profile_progression_hint",
        "profile_system_language_label",
    )

    @Test
    fun `a label with no reader left is gone from the seven folders`() {
        folders.forEach { folder ->
            assertWithMessage("clés sans lecteur encore présentes dans $folder")
                .that(removed.filter { it in all(folder).keys }).isEmpty()
        }
    }

    @Test
    fun `the header keeps its end to end badge, the request sent is one short line`() {
        assertThat(all("values-fr")["profile_e2ee"]).isEqualTo("Chiffrée de bout en bout")
        assertThat(epure("values-fr")["profile_connection_context_sent"]).isEqualTo("Demande envoyée à %1\$s, en attente de sa réponse.")
        assertThat(epure("values")["profile_connection_context_sent"]).isEqualTo("Request sent to %1\$s, waiting for their reply.")
    }

    @Test
    fun `every label born of the epure exists in the seven languages with the same arguments, translated`() {
        val reference = epure("values")
        assertThat(reference).isNotEmpty()
        val french = epure("values-fr")
        folders.drop(1).forEach { folder ->
            val local = epure(folder)
            assertWithMessage("absentes de $folder").that(reference.keys - local.keys).isEmpty()
            val drifted = reference.filter { (key, text) -> specifiers(text) != specifiers(local.getValue(key)) }.keys
            assertWithMessage("arguments divergents dans $folder").that(drifted).isEmpty()
            if (folder != "values-fr") {
                assertWithMessage("copies du français dans $folder").that(local.filter { (key, text) -> text == french[key] }.keys).isEmpty()
            }
        }
    }
}
