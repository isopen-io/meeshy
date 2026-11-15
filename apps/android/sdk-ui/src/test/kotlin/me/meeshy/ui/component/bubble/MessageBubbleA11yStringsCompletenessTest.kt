package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

class MessageBubbleA11yStringsCompletenessTest {

    private val locales = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val keys = listOf(
        "a11y_message_videos",
        "a11y_message_reply_to_you",
        "a11y_message_contact_card",
        "a11y_message_contact_card_account",
        "a11y_delivery_slow",
        "a11y_message_view_once_sealed",
        "a11y_message_view_once",
        "a11y_message_blurred",
    )

    private fun resDir(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .flatMap { sequenceOf(File(it, "src/main/res"), File(it, "sdk-ui/src/main/res")) }
        .first { File(it, "values/strings_message_a11y.xml").exists() }

    @Test
    fun `every accessibility key exists and is non blank in all seven languages`() {
        val res = resDir()
        locales.forEach { locale ->
            val xml = File(res, "$locale/strings_message_a11y.xml").readText()
            keys.forEach { key ->
                val value = Regex("""<string name="$key">(.*?)</string>""").find(xml)?.groupValues?.get(1)
                assertThat(value).isNotNull()
                assertThat(value!!.trim()).isNotEmpty()
            }
        }
    }
}
