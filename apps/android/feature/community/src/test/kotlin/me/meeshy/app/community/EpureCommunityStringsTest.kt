package me.meeshy.app.community

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * L'épure des communautés : les états vides n'ont plus de sous-titre, l'erreur tient en une ligne.
 * Un libellé nomme ; ce qui n'a plus de lecteur quitte les sept dossiers dans le même commit ; ce qui est raccourci
 * est traduit, jamais recopié du français (#18083, épure #17584).
 */
class EpureCommunityStringsTest {

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val resDir: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .map { File(it, "feature/community/src/main/res") }
        .first { it.isDirectory }

    private val pattern = Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)

    private fun unescape(raw: String) = raw.replace("\\'", "'").replace("&amp;", "&")

    private fun all(folder: String): Map<String, String> =
        File(resDir, folder).listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            pattern.findAll(file.readText()).map { it.groupValues[1] to unescape(it.groupValues[2]) }.toList()
        }.toMap()

    private val removed = listOf(
        "community_list_empty_subtitle",
        "community_detail_channels_empty_subtitle",
        "community_detail_posts_empty_subtitle",
        "community_members_empty_subtitle",
        "community_invite_empty_subtitle",
        "community_detail_posts_empty_action",
        "community_add_channel_conversation_fallback_name",
    )

    @Test
    fun `a label with no reader left is gone from the seven folders`() {
        folders.forEach { folder ->
            assertWithMessage("clés sans lecteur encore présentes dans $folder")
                .that(removed.filter { it in all(folder).keys }).isEmpty()
        }
    }

    @Test
    fun `the empty states keep their title and their action`() {
        val fr = all("values-fr")
        assertThat(fr["community_list_empty_title"]).isNotEmpty()
        assertThat(fr["community_list_empty_create_button"]).isNotEmpty()
        assertThat(fr["community_members_empty_title"]).isNotEmpty()
        assertThat(fr["community_members_empty_action"]).isNotEmpty()
        assertThat(fr["community_detail_channels_empty_action"]).isNotEmpty()
        assertThat(fr["community_settings_error_default"]).isEqualTo("Une erreur s'est produite")
    }
}
