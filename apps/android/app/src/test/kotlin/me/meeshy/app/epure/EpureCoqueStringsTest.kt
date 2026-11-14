package me.meeshy.app.epure

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Test
import org.w3c.dom.Element

/**
 * Épure de la coque (#18099, épure #17584) : les descriptions de canaux affichées par les réglages système
 * tiennent en quatre-vingts caractères, et les refus, le partage entrant et la reprise de la base locale
 * disent leur conséquence en une ligne — dans les sept langues, traduits, avec les mêmes paramètres.
 */
class EpureCoqueStringsTest {

    private val folders = mapOf(
        "en" to "values",
        "fr" to "values-fr",
        "es" to "values-es",
        "pt" to "values-pt",
        "de" to "values-de",
        "it" to "values-it",
        "ar" to "values-ar",
    )

    private val resDir = File("src/main/res")

    private fun strings(folder: String): Map<String, String> {
        val builder = DocumentBuilderFactory.newInstance().newDocumentBuilder()
        return File(resDir, folder).listFiles { f -> f.name.startsWith("strings") && f.extension == "xml" }.orEmpty()
            .flatMap { file ->
                val nodes = builder.parse(file).getElementsByTagName("string")
                (0 until nodes.length).map { nodes.item(it) as Element }
                    .map { it.getAttribute("name") to it.textContent.replace("\\'", "'") }
            }.toMap()
    }

    private val byLanguage = folders.mapValues { (_, folder) -> strings(folder) }

    private fun text(language: String, key: String): String =
        checkNotNull(byLanguage.getValue(language)[key]) { "$language : la clé $key manque" }

    private val keys = listOf(
        "bring_channel_description",
        "talkie_wake_channel_description",
        "gesture_refusal_slow_mode",
        "share_sheet_sign_in_body_reshare",
        "degraded_mode_body",
    )

    @Test
    fun `les canaux de notification tiennent en quatre-vingts caracteres dans toutes les langues`() {
        listOf("bring_channel_description", "talkie_wake_channel_description").forEach { key ->
            folders.keys.forEach { language ->
                assertWithMessage("$language/$key").that(text(language, key).length).isAtMost(80)
            }
        }
    }

    @Test
    fun `les textes de la coque en francais`() {
        assertThat(text("fr", "bring_channel_description")).isEqualTo("Sonne quand un proche déclenche un Bring, même en silencieux")
        assertThat(text("fr", "talkie_wake_channel_description")).isEqualTo("Un proche vous parle : sa voix sort, même en arrière-plan")
        assertThat(text("fr", "gesture_refusal_slow_mode")).isEqualTo("Nouveaux comptes : un message toutes les 30 s. Réessayez dans %1\$d s.")
        assertThat(text("fr", "share_sheet_sign_in_body_reshare")).isEqualTo("Rien n’a été copié : connectez-vous, puis repartagez.")
        assertThat(text("fr", "degraded_mode_body"))
            .isEqualTo("Stockage local indisponible : vos données sont sûres sur le serveur ; certaines peuvent manquer ici.")
    }

    @Test
    fun `la reprise de la base locale garde sa rassurance dans toutes les langues`() {
        assertThat(text("en", "degraded_mode_body")).contains("safe on the server")
        assertThat(text("en", "degraded_mode_body")).contains("on this device")
        assertThat(text("fr", "degraded_mode_body")).contains("sûres sur le serveur")
        assertThat(text("fr", "degraded_mode_body")).contains("manquer ici")
    }

    @Test
    fun `chaque texte existe dans les sept langues, traduit, avec les memes parametres`() {
        keys.forEach { key ->
            val english = text("en", key)
            val placeholders = Regex("%\\d+\\$[sd]").findAll(english).map { it.value }.toList()
            folders.keys.forEach { language ->
                val value = text(language, key)
                assertWithMessage("$language/$key paramètres").that(Regex("%\\d+\\$[sd]").findAll(value).map { it.value }.toList())
                    .containsExactlyElementsIn(placeholders)
                if (language != "fr" && language != "en") {
                    assertWithMessage("$language/$key copié du français").that(value).isNotEqualTo(text("fr", key))
                    assertWithMessage("$language/$key copié de l'anglais").that(value).isNotEqualTo(english)
                }
            }
        }
    }

    @Test
    fun `les anciens textes bavards ne subsistent dans aucune langue`() {
        listOf("Fait sonner votre", "Les nouveaux comptes envoient", "n'a pas pu ouvrir normalement", "could not open its local storage").forEach { phrase ->
            byLanguage.forEach { (language, entries) ->
                assertWithMessage("$language contient encore « $phrase »").that(entries.values.none { phrase in it }).isTrue()
            }
        }
    }
}
