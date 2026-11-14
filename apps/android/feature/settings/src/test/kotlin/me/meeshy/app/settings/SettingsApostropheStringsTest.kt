package me.meeshy.app.settings

import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.app.settings.SettingsResourceTree as Tree
import org.junit.Test

/** Une apostrophe non échappée fait échouer aapt2 : la question du (i) ne s'afficherait dans aucune langue (revue #17659). */
class SettingsApostropheStringsTest {

    private val unescaped = Regex("""(?<!\\)'""")

    @Test
    fun `every apostrophe of the settings strings is escaped, in every language`() {
        (listOf<String?>(null) + Tree.locales).forEach { locale ->
            Tree.entriesOf(locale).values.forEach { entry ->
                val texts = if (entry.isPlural) entry.quantities.values else listOf(entry.text)
                texts.forEach { text ->
                    assertWithMessage("${entry.name} en ${locale ?: "en"} : apostrophe non échappée")
                        .that(unescaped.containsMatchIn(text.removeSurrounding("\""))).isFalse()
                }
            }
        }
    }
}
