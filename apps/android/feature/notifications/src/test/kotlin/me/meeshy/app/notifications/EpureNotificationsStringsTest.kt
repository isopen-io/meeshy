package me.meeshy.app.notifications

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * L'épure des notifications : l'état vide d'une catégorie tient en son titre.
 * Un libellé nomme ; ce qui n'a plus de lecteur quitte les sept dossiers dans le même commit ; ce qui est raccourci
 * est traduit, jamais recopié du français (#18083, épure #17584).
 */
class EpureNotificationsStringsTest {

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val resDir: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .map { File(it, "feature/notifications/src/main/res") }
        .first { it.isDirectory }

    private val pattern = Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)

    private fun unescape(raw: String) = raw.replace("\\'", "'").replace("&amp;", "&")

    private fun all(folder: String): Map<String, String> =
        File(resDir, folder).listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            pattern.findAll(file.readText()).map { it.groupValues[1] to unescape(it.groupValues[2]) }.toList()
        }.toMap()

    private val removed = listOf(
        "notifications_error_subtitle",
        "notifications_empty_subtitle",
        "notifications_empty_category",
    )

    @Test
    fun `a label with no reader left is gone from the seven folders`() {
        folders.forEach { folder ->
            assertWithMessage("clés sans lecteur encore présentes dans $folder")
                .that(removed.filter { it in all(folder).keys }).isEmpty()
        }
    }

    @Test
    fun `every category keeps its own empty title`() {
        val fr = all("values-fr")
        listOf("notifications_empty", "notifications_empty_unread", "notifications_empty_messages", "notifications_empty_calls").forEach {
            assertThat(fr[it]).isNotEmpty()
        }
    }

    @Test
    fun `the load failure keeps its title and its retry`() {
        val fr = all("values-fr")
        assertThat(fr["notifications_error_title"]).isNotEmpty()
        assertThat(fr["notifications_error_retry"]).isNotEmpty()
    }
}
