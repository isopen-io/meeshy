package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * L'épure de la liste, des liens et de la recherche (#17697, épure #17584) : un libellé nomme, un état vide
 * tient en une ligne, et ce qui n'a plus de lecteur quitte les sept dossiers dans le même commit. Les mots
 * courts sont ceux de `docs/product/epure-lexique.md`.
 */
class EpureListeStringsTest {

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val resDir: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .map { File(it, "feature/conversations/src/main/res") }
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

    private val removed = listOf(
        "conversations_empty_subtitle", "conversations_no_results_subtitle", "empty_states_search_try_other_terms",
        "global_search_no_results_hint", "global_search_failed_hint", "links_hub_banner_title",
        "share_link_permission_messages_subtitle", "share_link_permission_images_subtitle",
        "share_link_permission_files_subtitle", "share_link_permission_history_subtitle",
        "share_link_access_account_subtitle", "share_link_access_nickname_subtitle",
        "share_link_access_email_subtitle", "share_link_access_birthday_subtitle",
        "new_conversation_contacts_empty_subtitle", "share_link_picker_empty_body",
        "share_link_created_subtitle",
        "conversations_action_more", "links_hub_banner_subtitle",
    )

    /** Mots que le lexique écrit pareil en français et en anglais : ce n'est pas une recopie. */
    private val sameWordInFrench = setOf(
        "share_link_permission_images", "share_link_access_email", "invite_access_email", "shareLink_detail_requireEmail",
        "share_link_field_description",
    )

    private fun specifiers(text: String) = Regex("""%(\d+)\$[sd]""").findAll(text).map { it.value }.sorted().toList()

    @Test
    fun `a label with no reader left is gone from the seven folders`() {
        folders.forEach { folder ->
            assertWithMessage("clés sans lecteur encore présentes dans $folder")
                .that(removed.filter { it in all(folder).keys }).isEmpty()
        }
    }

    @Test
    fun `every shortened label exists in the seven languages with the same arguments`() {
        val reference = epure("values")
        assertThat(reference).isNotEmpty()
        folders.drop(1).forEach { folder ->
            val local = epure(folder)
            assertWithMessage("absentes de $folder").that(reference.keys - local.keys).isEmpty()
            val drifted = reference.filter { (key, text) -> specifiers(text) != specifiers(local.getValue(key)) }.keys
            assertWithMessage("arguments divergents dans $folder").that(drifted).isEmpty()
        }
    }

    @Test
    fun `a shortened label is translated, never copied from the French`() {
        val french = epure("values-fr")
        val copies = folders.filterNot { it == "values-fr" }.flatMap { folder ->
            epure(folder).filter { (key, text) -> text == french[key] && key !in sameWordInFrench }.keys.map { "$folder:$it" }
        }
        assertThat(copies).isEmpty()
    }

    @Test
    fun `the row menu entry is the lexicon word More`() {
        val expected = mapOf(
            "values" to "More", "values-fr" to "Plus", "values-es" to "Más", "values-pt" to "Mais",
            "values-de" to "Mehr", "values-it" to "Altro", "values-ar" to "المزيد",
        )
        expected.forEach { (folder, word) -> assertThat(all(folder)["context_more_options"]).isEqualTo(word) }
    }

    @Test
    fun `guest permissions are nouns under an Allow title, guest requirements are nouns under Ask guests`() {
        val en = all("values")
        assertThat(en["share_link_section_permissions"]).isEqualTo("Allow")
        assertThat(en["share_link_section_access"]).isEqualTo("Ask guests")
        assertThat(listOf("messages", "images", "files", "history").map { en["share_link_permission_$it"] })
            .containsExactly("Messages", "Images", "Files", "History").inOrder()
        assertThat(listOf("account", "nickname", "email", "birthday").map { en["share_link_access_$it"] })
            .containsExactly("Meeshy account", "Username", "Email", "Date of birth").inOrder()
        assertThat(en["share_link_section_permissions_subtitle"]).isEqualTo("What anonymous guests can do")
        assertThat(en["share_link_section_access_subtitle"]).isEqualTo("What visitors must provide in order to join")
    }

    @Test
    fun `the invitation sheet and the link detail say the same words as the creation form`() {
        val fr = all("values-fr")
        assertThat(fr["share_link_section_permissions"]).isEqualTo("Autoriser")
        assertThat(fr["invite_section_permissions"]).isEqualTo("Autoriser")
        assertThat(fr["share_link_section_access"]).isEqualTo("Demander aux invités")
        assertThat(fr["invite_section_access"]).isEqualTo("Demander aux invités")
        listOf("invite_access_account", "shareLink_detail_requireAccount", "share_link_access_account").forEach { assertThat(fr[it]).isEqualTo("Compte Meeshy") }
        listOf("invite_access_nickname", "shareLink_detail_requireNickname", "share_link_access_nickname").forEach { assertThat(fr[it]).isEqualTo("Pseudo") }
        listOf("shareLink_detail_requireBirthday", "share_link_access_birthday").forEach { assertThat(fr[it]).isEqualTo("Date de naissance") }
        listOf("shareLink_detail_historyRight", "share_link_permission_history").forEach { assertThat(fr[it]).isEqualTo("Historique") }
    }

    @Test
    fun `the link rows and the empty states keep the sentences the rule 7 keeps visible`() {
        val en = all("values")
        assertThat(en["shareLink_detail_createdOn"]).contains("%1\$s")
        assertThat(en["conversations_error_subtitle"]).isEqualTo("Couldn't load your conversations.")
        assertThat(en["conversations_empty"]).isEqualTo("No conversations yet")
    }

    @Test
    fun `the group switch keeps its label alone, the solo hint has no reader and leaves the seven folders`() {
        folders.forEach { folder ->
            assertWithMessage(folder).that(all(folder).keys).doesNotContain("new_conversation_group_solo_hint")
        }
        assertThat(all("values")["new_conversation_group_toggle"]).isEqualTo("New group")
        val sheet = File(resDir.parentFile.parentFile, "main/kotlin/me/meeshy/app/conversations/NewConversationSheet.kt").readText()
        assertThat(sheet).doesNotContain("solo_hint")
    }

    @Test
    fun `the link identity fields are named, the optional part reads at the empty field`() {
        val expected = mapOf(
            "values" to ("Description" to "Link address"), "values-fr" to ("Description" to "Adresse du lien"),
            "values-es" to ("Descripción" to "Dirección del enlace"), "values-pt" to ("Descrição" to "Endereço do link"),
            "values-de" to ("Beschreibung" to "Link-Adresse"), "values-it" to ("Descrizione" to "Indirizzo del link"),
            "values-ar" to ("الوصف" to "عنوان الرابط"),
        )
        expected.forEach { (folder, pair) ->
            assertThat(epure(folder)["share_link_field_description"]).isEqualTo(pair.first)
            assertThat(epure(folder)["share_link_field_slug"]).isEqualTo(pair.second)
        }
    }

    @Test
    fun `an empty list of share, tracking or referral links still says, at rest, what such a link is for`() {
        folders.forEach { folder ->
            val strings = all(folder)
            listOf("my_share_links_empty_subtitle", "links_tracking_empty_subtitle", "links_affiliate_empty_subtitle").forEach { key ->
                assertWithMessage("$folder:$key").that(strings[key].orEmpty()).isNotEmpty()
            }
        }
        assertThat(all("values-fr")["links_tracking_empty_subtitle"]).isEqualTo("Créez un lien pour suivre vos clics et campagnes")
    }

    @Test
    fun `the hybrid choice says our servers can read the messages`() {
        assertThat(epure("values-fr")["encryption_mode_hybrid_description"])
            .isEqualTo("Chiffré sur nos serveurs, qui peuvent lire vos messages. Textes vérifiés intacts entre appareils compatibles.")
        assertThat(epure("values")["encryption_mode_hybrid_description"])
            .isEqualTo("Encrypted on our servers, which can read your messages. Texts checked intact between compatible devices.")
    }

    @Test
    fun `the four link families are the lexicon words on the hub, with their one line description kept`() {
        val expected = mapOf(
            "values" to listOf("Sharing", "Tracking", "Referral", "Communities"),
            "values-fr" to listOf("Partage", "Suivi", "Parrainage", "Communautés"),
            "values-es" to listOf("Compartir", "Seguimiento", "Referidos", "Comunidades"),
            "values-pt" to listOf("Compartilhamento", "Rastreamento", "Indicação", "Comunidades"),
            "values-de" to listOf("Teilen", "Tracking", "Empfehlung", "Communities"),
            "values-it" to listOf("Condivisione", "Tracciamento", "Referral", "Community"),
            "values-ar" to listOf("مشاركة", "التتبّع", "الإحالة", "المجتمعات"),
        )
        val keys = listOf("share", "tracking", "affiliate", "community").map { "links_hub_${it}_title" }
        expected.forEach { (folder, words) ->
            assertThat(keys.map { epure(folder)[it] }).containsExactlyElementsIn(words).inOrder()
            listOf("share", "tracking", "affiliate", "community").forEach { family ->
                assertWithMessage("$folder description $family").that(all(folder)["links_hub_${family}_description"]).isNotEmpty()
            }
        }
        assertThat(all("values-fr")["links_hub_affiliate_title"]).isEqualTo(all("values-fr")["links_affiliate_title"])
    }

    @Test
    fun `the empty states of referral and tracking keep their title, the creation action stays on the bar`() {
        assertThat(all("values-fr")["links_affiliate_empty_title"]).isEqualTo("Aucun lien de parrainage")
        assertThat(all("values-fr")["links_tracking_empty_title"]).isEqualTo("Aucun lien de suivi")
        folders.forEach { assertThat(all(it)["links_tracking_create_a11y"]).isNotEmpty() }
    }
}
