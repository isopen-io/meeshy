package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * L'épure des appels : le journal vide et la recherche vide tiennent en une ligne, la transcription garde où elle vit et range le détail derrière un (i).
 * Un libellé nomme ; ce qui n'a plus de lecteur quitte les sept dossiers dans le même commit ; ce qui est raccourci
 * est traduit, jamais recopié du français (#18083, épure #17584).
 */
class EpureCallsStringsTest {

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val resDir: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .map { File(it, "feature/calls/src/main/res") }
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
        "call_history_empty",
        "call_journal_search_empty_hint",
    )

    @Test
    fun `a label with no reader left is gone from the seven folders`() {
        folders.forEach { folder ->
            assertWithMessage("clés sans lecteur encore présentes dans $folder")
                .that(removed.filter { it in all(folder).keys }).isEmpty()
        }
    }

    @Test
    fun `a search with no result is one line that carries the window`() {
        assertThat(epure("values-fr")["call_journal_search_empty"]).isEqualTo("Aucun appel ne correspond à « %1\$s » dans les trois derniers mois.")
        assertThat(epure("values")["call_journal_search_empty"]).isEqualTo("No call matches “%1\$s” in the last three months.")
    }

    @Test
    fun `the transcript keeps both places visible and parks the content of the log behind its question`() {
        val fr = all("values-fr")
        assertThat(fr["call_transcript_disclaimer"]).isEqualTo(
            "Copie chiffrée sur cet appareil. Le journal de l’appel est aussi conservé sur le serveur Meeshy, lisible par ses seuls participants.",
        )
        assertThat(fr["call_transcript_disclaimer"]).doesNotContain("interlocuteur")
        assertThat(epure("values-fr")["call_transcript_note_question"]).isEqualTo("Que contient ce journal ?")
        assertThat(epure("values-fr")["call_transcript_note"]).contains("interlocuteur")
        folders.forEach { folder ->
            assertWithMessage("$folder question").that(epure(folder).getValue("call_transcript_note_question")).containsMatch("[?؟]")
            assertWithMessage("$folder disclaimer").that(all(folder).getValue("call_transcript_disclaimer")).isNotEmpty()
        }
    }

    @Test
    fun `the note behind the info button reads as a sentence of its own, not the tail of the one it left`() {
        assertThat(epure("values-ar")["call_transcript_note"]).isEqualTo("يتضمن كلام محاورك كما وصل أثناء المكالمة.")
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
