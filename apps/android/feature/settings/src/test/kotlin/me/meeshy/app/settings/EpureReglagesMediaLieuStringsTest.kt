package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.app.settings.SettingsResourceTree as Tree
import org.junit.Test

/** Épure 1/3 des réglages Android (#17659) : la rangée « Conserver le lieu des photos » nomme, la note vit derrière un (i). */
class EpureReglagesMediaLieuStringsTest {

    private val allLocales: List<String?> = listOf<String?>(null) + Tree.locales

    private fun fr(name: String): String = Tree.entriesOf("fr").getValue(name).text.replace("\\'", "'")

    private val screen: String get() = Tree.kotlinSources().first { it.name == "MediaDownloadScreen.kt" }.readText()

    @Test
    fun `the location subtitle is gone from every locale and from the screen`() {
        allLocales.forEach { locale ->
            assertWithMessage("subtitle encore présent en ${locale ?: "en"}")
                .that(Tree.entriesOf(locale).keys).doesNotContain("settings_media_outgoing_location_subtitle")
        }
        assertThat(screen).doesNotContain("settings_media_outgoing_location_subtitle")
        assertThat(screen).doesNotContain("subtitle: String?")
    }

    @Test
    fun `the info button is named by the question and its note keeps the GPS removal`() {
        assertThat(fr("settings_media_outgoing_location_question")).isEqualTo("Que devient la position GPS de mes photos ?")
        assertThat(fr("settings_media_outgoing_location_note"))
            .isEqualTo("Par défaut, la position GPS est retirée de chaque photo avant l'envoi.")
        assertThat(screen).contains("settings_media_outgoing_location_question")
        assertThat(screen).contains("settings_media_outgoing_location_note")
    }

    @Test
    fun `question and note are translated in every language`() {
        listOf("settings_media_outgoing_location_question", "settings_media_outgoing_location_note").forEach { key ->
            Tree.locales.filter { it != "fr" }.forEach { locale ->
                val text = Tree.entriesOf(locale).getValue(key).text
                assertWithMessage("$key vide en $locale").that(text.trim()).isNotEmpty()
                assertWithMessage("$key copié du français en $locale").that(text).isNotEqualTo(Tree.entriesOf("fr").getValue(key).text)
            }
            assertThat(Tree.entriesOf(null).getValue(key).text).isNotEqualTo(Tree.entriesOf("fr").getValue(key).text)
        }
    }
}
