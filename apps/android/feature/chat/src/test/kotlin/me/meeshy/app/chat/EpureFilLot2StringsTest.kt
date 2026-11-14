package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Épure 2/3 du fil (#17697, épure #17584) : la fiche Chiffrement ne redit pas dans une rangée ce que son sujet
 * « Ce qui marche » dit déjà, et les deux réglages propres à Meeshy (traduction automatique du Prisme, mode
 * annonce) portent leur phrase VISIBLE au repos, sans (i) : règle 7, les repères restent.
 */
class EpureFilLot2StringsTest {

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

    private val removed = listOf(
        "encryption_detail_translation", "encryption_detail_translation_on_device",
        "encryption_detail_translation_available", "encryption_detail_translation_disabled",
    )

    private val hints = listOf("conversation_settings_auto_translate_hint", "conversation_settings_announcement_hint")

    @Test
    fun `the encryption sheet has no Translation row, the What works subject already says it`() {
        val sheet = File(sources, "ConversationEncryptionSheet.kt").readText()
        removed.forEach { assertThat(sheet).doesNotContain(it) }
        assertThat(sheet).contains("encryption_detail_mode_label")
        assertThat(sheet).contains("encryption_detail_enabled_on")
    }

    @Test
    fun `the four translation row labels leave the seven folders and the manifest`() {
        folders.forEach { folder ->
            assertWithMessage("clés sans lecteur encore présentes dans $folder")
                .that(removed.filter { it in all(folder).keys }).isEmpty()
        }
        val manifest = File(moduleRoot, "i18n/manifest").walkTopDown().filter { it.extension == "json" }.joinToString("\n") { it.readText() }
        removed.forEach { assertThat(manifest).doesNotContain("\"androidName\": \"$it\"") }
    }

    @Test
    fun `auto translate and announcement mode each say their sentence under the row, in the seven languages`() {
        val settings = File(sources, "ConversationSettingsSheet.kt").readText()
        hints.forEach { assertThat(settings).contains("R.string.$it") }
        val french = all("values-fr")
        hints.forEach { key ->
            folders.forEach { folder ->
                assertWithMessage("$key dans $folder").that(all(folder)[key]).isNotEmpty()
            }
            folders.filterNot { it == "values-fr" }.forEach { folder ->
                assertWithMessage("$key recopié du français dans $folder").that(all(folder)[key]).isNotEqualTo(french[key])
            }
        }
        assertThat(french["conversation_settings_auto_translate_hint"]).isEqualTo("Les messages arrivent dans la langue de chaque membre.")
        assertThat(french["conversation_settings_announcement_hint"]).isEqualTo("Seuls les rôles autorisés écrivent, les autres lisent.")
    }

    @Test
    fun `the two labels stay and the sentence is visible text, never an info icon`() {
        val settings = File(sources, "ConversationSettingsSheet.kt").readText()
        assertThat(settings).contains("R.string.conversation_settings_auto_translate)")
        assertThat(settings).contains("R.string.conversation_settings_announcement)")
        assertThat(settings).doesNotContain("InfoNote")
        assertThat(all("values")["conversation_settings_auto_translate"]).isEqualTo("Auto-translate")
        assertThat(all("values")["conversation_settings_announcement"]).isEqualTo("Announcement mode")
    }
}
