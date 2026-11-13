package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * L'épure du fil (#17697, épure #17584) : un libellé nomme, ce qui n'a plus de lecteur quitte les sept dossiers
 * dans le même commit, et les chaînes raccourcies vivent dans `strings_epure_android.xml`, hors du générateur iOS,
 * traduites — jamais recopiées du français.
 */
class EpureListeFilStringsTest {

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val resDir: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .map { File(it, "feature/chat/src/main/res") }
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

    private val removed = listOf(
        "conversation_options_leave_group", "conversation_options_leave_group_title",
        "conversation_options_leave_group_confirm", "conversation_options_leave_group_message",
        "encryption_detail_inactive_subtitle",
    )

    private val sameWordInFrench = emptySet<String>()

    private fun specifiers(text: String) = Regex("""%(\d+)\$[sd]""").findAll(text).map { it.value }.sorted().toList()

    @Test
    fun `a label with no reader left is gone from the seven folders`() {
        folders.forEach { folder ->
            assertWithMessage("clés sans lecteur encore présentes dans $folder")
                .that(removed.filter { it in all(folder).keys }).isEmpty()
        }
    }

    @Test
    fun `the leave gesture keeps ONE confirmation sentence, not three`() {
        val en = all("values")
        assertThat(en["conversation_options_leave_message"]).isEqualTo("You'll no longer receive messages. Your history stays readable.")
        assertThat(en.keys.filter { it.startsWith("conversation_options_leave_group") }).isEmpty()
    }

    @Test
    fun `every shortened label exists in the seven languages with the same arguments`() {
        val reference = epure("values")
        assertThat(reference).isNotEmpty()
        folders.drop(1).forEach { folder ->
            val local = epure(folder)
            assertWithMessage("absentes de $folder").that(reference.keys - local.keys).isEmpty()
            val drifted = reference.filter { (key, text) -> specifiers(text) != specifiers(local.getValue(key)) }.keys
            assertWithMessage("arguments divergents dans $folder").that(drifted).isEmpty()
        }
    }

    @Test
    fun `a shortened label is translated, never copied from the French`() {
        val french = epure("values-fr")
        val copies = folders.filterNot { it == "values-fr" }.flatMap { folder ->
            epure(folder).filter { (key, text) -> text == french[key] && key !in sameWordInFrench }.keys.map { "$folder:$it" }
        }
        assertThat(copies).isEmpty()
    }

    @Test
    fun `More is the lexicon word without an ellipsis, on the action sheet and on the options card`() {
        val expected = mapOf(
            "values" to "More", "values-fr" to "Plus", "values-es" to "Más", "values-pt" to "Mais",
            "values-de" to "Mehr", "values-it" to "Altro", "values-ar" to "المزيد",
        )
        expected.forEach { (folder, word) ->
            assertThat(all(folder)["action_more"]).isEqualTo(word)
            assertThat(all(folder)["conversation_options_section_actions"]).isEqualTo(word)
        }
    }

    @Test
    fun `the shortened long sentences fit in 80 characters in the French`() {
        val fr = all("values-fr")
        listOf("location_locate_failed", "share_content_refused_source", "share_capture_warning", "share_offline").forEach { key ->
            assertWithMessage(key).that(fr.getValue(key).length).isAtMost(80)
        }
        assertThat(all("values")["share_offline"]).isEqualTo("Offline: unsent items go out when you're back.")
        assertThat(all("values")["share_capture_warning"]).isEqualTo("Publishing this capture shows it beyond this conversation.")
        assertThat(all("values")["share_content_refused_source"]).isEqualTo("Meeshy can't open a file path. Share the file itself.")
        assertThat(all("values")["location_locate_failed"]).isEqualTo("Position not found. Try near a window or with Wi-Fi on.")
    }

    @Test
    fun `the two encryption notes are phrased as the question they answer`() {
        folders.forEach { folder ->
            val strings = epure(folder)
            listOf("encryption_note_devices_question", "encryption_note_switching_question").forEach { key ->
                assertWithMessage("$folder:$key").that(strings.getValue(key)).containsMatch("[?؟]")
            }
        }
        assertThat(epure("values-fr")["encryption_note_devices_question"]).isEqualTo("Et si je change de téléphone ?")
        assertThat(epure("values-fr")["encryption_note_switching_question"]).isEqualTo("Qui peut changer le mode, et que devient l'historique ?")
    }

    @Test
    fun `the irreversibility stays whole and visible, the activation footer is untouched`() {
        val en = all("values")
        assertThat(en["encryption_detail_activation_footer_final"]).contains("can never be turned off")
        assertThat(en["encryption_fact_end_to_end_is_final"]).contains("can’t be turned off")
        assertThat(en["encryption_fact_end_to_end_never_turned_off"]).contains("never be turned off")
    }
}
