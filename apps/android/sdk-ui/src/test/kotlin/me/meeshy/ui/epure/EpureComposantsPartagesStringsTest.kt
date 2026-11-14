package me.meeshy.ui.epure

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Test
import org.w3c.dom.Element

/**
 * Épure des composants partagés (#18099, épure #17584) : ce que l'écran énonce, dans les sept langues.
 *
 * Un libellé nomme ; il est court, traduit (jamais copié du français), et garde ses repères — « étincelles »
 * dans la limite de gestes, la phrase du Bring au repos. Ce qui quitte l'écran vit derrière un (i) : sa
 * question et sa note existent dans chaque langue.
 */
class EpureComposantsPartagesStringsTest {

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

    private val shortened = listOf(
        "post_daily_limit_comment",
        "post_daily_limit_comment_untimed",
        "post_daily_limit_reaction",
        "post_daily_limit_reaction_untimed",
        "bubble_failed_media_lost",
        "bubble_failed_location_refused",
        "bubble_failed_attachment_right",
        "bring_explain",
        "talkie_send_voice_copy",
        "voiceProfile_processing_description",
        "voiceProfile_recording_description",
        "audio_consent_notice_message",
    )

    private val behindInfo = listOf("recognition_language_question", "bring_silent_question", "bring_silent_note", "recognition_language_hint")

    @Test
    fun `la limite de commentaires dit la limite et la reprise en une ligne et garde le repere etincelles`() {
        assertThat(text("fr", "post_daily_limit_comment"))
            .isEqualTo("Limite de commentaires atteinte : reprise à %1\$s. Elle compte vos gestes, jamais vos étincelles.")
        assertThat(text("fr", "post_daily_limit_comment_untimed"))
            .isEqualTo("Limite de commentaires atteinte. Elle compte vos gestes, jamais vos étincelles.")
    }

    @Test
    fun `la limite de reactions dit la limite et la reprise en une ligne et garde le repere etincelles`() {
        assertThat(text("fr", "post_daily_limit_reaction"))
            .isEqualTo("Limite de réactions atteinte : reprise à %1\$s. Elle compte vos gestes, jamais vos étincelles.")
        assertThat(text("fr", "post_daily_limit_reaction_untimed"))
            .isEqualTo("Limite de réactions atteinte. Elle compte vos gestes, jamais vos étincelles.")
    }

    @Test
    fun `la bulle non envoyee dit pourquoi en une phrase courte`() {
        assertThat(text("fr", "bubble_failed_media_lost")).isEqualTo("Non envoyé : média introuvable. Touchez pour le retirer.")
        assertThat(text("fr", "bubble_failed_location_refused"))
            .isEqualTo("Non envoyé : lieu du fichier non retirable. Touchez pour retirer le fichier.")
        assertThat(text("fr", "bubble_failed_attachment_right")).isEqualTo("Ce type de pièce jointe n'est pas autorisé ici.")
    }

    @Test
    fun `le Bring garde sa phrase au repos et range le cas limite iPhone derriere son i`() {
        assertThat(text("fr", "bring_explain")).isEqualTo("Pour une urgence extrême : son téléphone sonne, même verrouillé.")
        assertThat(text("fr", "bring_silent_question")).isEqualTo("Et si son téléphone est en silencieux ?")
        assertThat(text("fr", "bring_silent_note"))
            .isEqualTo("Selon ses réglages, un iPhone en silencieux peut n’afficher qu’une alerte prioritaire.")
    }

    @Test
    fun `les libelles du talkie, du profil vocal et du consentement sont raccourcis`() {
        assertThat(text("fr", "talkie_send_voice_copy"))
            .isEqualTo("Accès d’urgence indisponible : un message vocal part dans votre dernière conversation avec cette personne.")
        assertThat(text("fr", "voiceProfile_processing_description")).isEqualTo("Traitement en cours, quelques minutes.")
        assertThat(text("fr", "voiceProfile_recording_description"))
            .isEqualTo("Lisez le texte à voix haute : 3 échantillons de 10 secondes au moins.")
        assertThat(text("fr", "audio_consent_notice_message"))
            .isEqualTo("Activez le consentement vocal pour transcrire et traduire vos audios.")
    }

    @Test
    fun `le choix de la langue de l audio range son explication derriere un i dont la question est une question`() {
        assertThat(text("fr", "recognition_language_question")).isEqualTo("Pourquoi si peu de langues ?")
        assertThat(text("fr", "recognition_language_hint"))
            .isEqualTo("Par défaut, seules les langues disponibles sur cet appareil sont listées.")
        folders.keys.forEach { language ->
            assertWithMessage("$language : la question du (i) n'est pas « Plus d'infos »")
                .that(text(language, "recognition_language_question").lowercase()).doesNotContain("info")
        }
    }

    @Test
    fun `chaque libelle epure existe dans les sept langues, traduit, avec les memes parametres`() {
        (shortened + behindInfo).forEach { key ->
            val english = text("en", key)
            val placeholders = Regex("%\\d+\\$[sd]").findAll(english).map { it.value }.toList()
            folders.keys.forEach { language ->
                val value = text(language, key)
                assertWithMessage("$language/$key vide").that(value).isNotEmpty()
                assertWithMessage("$language/$key : paramètres").that(Regex("%\\d+\\$[sd]").findAll(value).map { it.value }.toList())
                    .containsExactlyElementsIn(placeholders)
                if (language != "fr" && language != "en") {
                    assertWithMessage("$language/$key copié du français").that(value).isNotEqualTo(text("fr", key))
                    assertWithMessage("$language/$key copié de l'anglais").that(value).isNotEqualTo(english)
                }
            }
        }
    }

    @Test
    fun `aucun libelle epure ne depasse cent dix caracteres dans aucune langue`() {
        (shortened + "bring_silent_question" + "recognition_language_question").forEach { key ->
            folders.keys.forEach { language ->
                assertWithMessage("$language/$key").that(text(language, key).length).isAtMost(110)
            }
        }
    }

    @Test
    fun `les anciens textes bavards ne subsistent dans aucune langue`() {
        val retired = listOf("Vous avez fait tous les", "You’ve made all the", "média n'est plus disponible", "no longer available on this device")
        byLanguage.forEach { (language, entries) ->
            retired.forEach { phrase ->
                assertWithMessage("$language contient encore « $phrase »").that(entries.values.none { phrase in it }).isTrue()
            }
        }
        folders.keys.forEach { language ->
            assertThat(text(language, "bring_explain")).doesNotContain("iPhone")
        }
    }

    private val stickerHints = listOf("sticker_sheet_intent_humour_noir_hint", "sticker_sheet_intent_quotidien_hint", "sticker_sheet_intent_bonjour_hint")

    @Test
    fun `les trois pages de stickers les plus bavardes tiennent en une courte phrase`() {
        assertThat(text("fr", "sticker_sheet_intent_humour_noir_hint")).isEqualTo("Pour rire de tout, même du pire")
        assertThat(text("fr", "sticker_sheet_intent_quotidien_hint")).isEqualTo("Pour dire ce qu’on fait : café, repas, travail, route")
        assertThat(text("fr", "sticker_sheet_intent_bonjour_hint")).isEqualTo("Pour saluer, remercier, s’excuser")
        stickerHints.forEach { key ->
            folders.keys.forEach { language ->
                val value = text(language, key)
                assertWithMessage("$language/$key trop long").that(value.length).isAtMost(75)
                if (language != "fr" && language != "en") {
                    assertWithMessage("$language/$key copié du français").that(value).isNotEqualTo(text("fr", key))
                    assertWithMessage("$language/$key copié de l'anglais").that(value).isNotEqualTo(text("en", key))
                }
            }
        }
    }

    @Test
    fun `les autres lignes d'intention gardent leur repere`() {
        listOf("amour", "fete", "soutien", "rale", "coup_de_mou", "surprise").forEach { name ->
            folders.keys.forEach { language ->
                assertWithMessage("$language/$name").that(text(language, "sticker_sheet_intent_${name}_hint")).isNotEmpty()
            }
        }
    }

    @Test
    fun `le nom accessible du i est toujours la question, le repli En savoir plus a disparu des sept langues`() {
        folders.keys.forEach { language ->
            assertWithMessage("$language/settings_info_button_label").that(byLanguage.getValue(language).containsKey("settings_info_button_label")).isFalse()
        }
    }

    @Test
    fun `le mode Bulles n'a plus de sous-titre qui repete son titre, les autres modes gardent leur phrase`() {
        folders.keys.forEach { language ->
            assertWithMessage("$language/bubbles").that(byLanguage.getValue(language).containsKey("reading_mode_bubbles_subtitle")).isFalse()
            listOf("focal", "script", "summary", "river").forEach { mode ->
                assertWithMessage("$language/$mode").that(text(language, "reading_mode_${mode}_subtitle")).isNotEmpty()
            }
        }
    }
}
