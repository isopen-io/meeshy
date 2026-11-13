package me.meeshy.app.contacts

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * L'épure des contacts : demandes, clavier et cercles tiennent en une ligne.
 * Un libellé nomme ; ce qui n'a plus de lecteur quitte les sept dossiers dans le même commit ; ce qui est raccourci
 * est traduit, jamais recopié du français (#18083, épure #17584).
 */
class EpureContactsStringsTest {

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val resDir: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .map { File(it, "feature/contacts/src/main/res") }
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
        "contacts_requests_received_intent",
        "contacts_requests_empty_received_subtitle",
        "contacts_requests_empty_sent_subtitle",
        "circles_empty_title",
        "keypad_prompt_subtitle",
        "keypad_no_match_subtitle",
        "contacts_requests_empty",
        "contacts_discover_connect",
        "contacts_discover_contact",
        "contacts_list_mood_a11y",
        "contacts_blocked_unblock_a11y",
        "contacts_discover_blocked",
        "contacts_request_accept",
        "contacts_request_decline",
        "contacts_requests_received",
        "contacts_requests_sent",
        "keypad_delete_a11y_hint",
    )

    @Test
    fun `a label with no reader left is gone from the seven folders`() {
        folders.forEach { folder ->
            assertWithMessage("clés sans lecteur encore présentes dans $folder")
                .that(removed.filter { it in all(folder).keys }).isEmpty()
        }
    }

    @Test
    fun `the circles say once what a circle is, at rest, in the filled list and in the empty state`() {
        assertThat(epure("values-fr")["circles_intro"]).isEqualTo("Le cercle de chaque personne règle ce que tu partages avec elle.")
        assertThat(epure("values")["circles_intro"]).isEqualTo("Each person’s circle sets what you share with them.")
    }

    @Test
    fun `the circle sheet says Soon, the explanation of the disabled settings is gone`() {
        assertThat(all("values-fr")["circles_sheet_settings_unavailable"]).isEqualTo("Bientôt disponible")
        assertThat(all("values")["circles_sheet_settings_unavailable"]).isEqualTo("Coming soon")
        folders.forEach { assertThat(all(it).getValue("circles_sheet_settings_unavailable").length).isAtMost(24) }
    }

    @Test
    fun `the empty circles keep their action, Find contacts`() {
        assertThat(all("values-fr")["circles_empty_action"]).isEqualTo("Trouver des contacts")
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

    @Test
    fun `the blood ritual says once that the other let go`() {
        val expected = mapOf(
            "values-fr" to "L'autre a lâché. Rien n'a changé.",
            "values" to "The other let go. Nothing changed.",
        )
        expected.forEach { (folder, text) -> assertThat(all(folder)["circles_ritual_lapsed"]).isEqualTo(text) }
        val fr = all("values-fr")["circles_ritual_lapsed"].orEmpty()
        folders.filter { it != "values-fr" }.forEach {
            assertWithMessage("traduit, jamais copié du français : $it").that(all(it)["circles_ritual_lapsed"]).isNotEqualTo(fr)
        }
    }
}
