package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Revue de l'épure (#17697, règle 1 et lexique) : le verrouillage des conversations dit le même mot que les
 * réglages de sécurité (`security_lock_*`) — « code PIN principal » en français, « PIN maestro » / « PIN mestre »
 * en espagnol et en portugais jusque dans le dialogue « requis », « رمز PIN الرئيسي » en arabe (les autres clés arabes, indéfinies par accord, restent). L'anglais,
 * l'allemand et l'italien disaient déjà le mot des réglages.
 */
class EpureCodePinPrincipalTest {

    private val resDir: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .map { File(it, "feature/conversations/src/main/res") }
        .first { it.isDirectory }

    private val pattern = Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)

    private fun all(folder: String): Map<String, String> =
        File(resDir, folder).listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            pattern.findAll(file.readText()).map { it.groupValues[1] to it.groupValues[2] }.toList()
        }.toMap()

    private val lockKeys = listOf(
        "conversations_lock_title_create_master", "conversations_lock_title_confirm_master",
        "conversations_lock_title_new_master", "conversations_lock_title_remove_master",
        "conversations_lock_title_verify_master", "conversations_lock_subtitle_create_master",
        "conversations_lock_subtitle_new_master", "conversations_lock_subtitle_change_verify",
        "conversations_lock_subtitle_verify_master", "conversations_lock_subtitle_unlock_all",
        "conversations_lock_error_master_incorrect", "conversations_change_master_pin",
        "conversations_remove_master_pin", "dialogs_master_pin_title",
    )

    private val forbidden = mapOf(
        "values-fr" to listOf("master PIN"),
        "values-es" to listOf("PIN principal"),
        "values-pt" to listOf("PIN principal"),
    )

    @Test
    fun `the lock sheet says the word of the security settings in every language`() {
        forbidden.forEach { (folder, words) ->
            val strings = all(folder)
            lockKeys.filter { it in strings }.forEach { key ->
                words.forEach { word ->
                    assertWithMessage("$folder/$key").that(strings.getValue(key)).doesNotContain(word)
                }
            }
        }
    }

    @Test
    fun `the required dialog uses the exact word of the settings row`() {
        val expected = mapOf(
            "values-fr" to "code PIN principal",
            "values-es" to "PIN maestro",
            "values-pt" to "PIN mestre",
            "values-ar" to "رمز PIN الرئيسي",
        )
        expected.forEach { (folder, word) ->
            assertWithMessage("$folder/dialogs_master_pin_title")
                .that(all(folder).getValue("dialogs_master_pin_title")).contains(word)
        }
    }
}
