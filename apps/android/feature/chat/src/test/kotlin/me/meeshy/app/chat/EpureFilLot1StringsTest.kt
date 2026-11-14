package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Épure 1/3 du fil (#17697, épure #17584) : la fiche d'un membre entré par un lien dit les mots du lexique, un
 * état vide tient en une ligne, un refus de sortie laisse son titre porter la conséquence, et ce qui n'a plus
 * de lecteur quitte les sept dossiers dans le même commit.
 */
class EpureFilLot1StringsTest {

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val moduleRoot: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .first { File(it, "feature/chat/src/main/res").isDirectory }

    private val resDir = File(moduleRoot, "feature/chat/src/main/res")
    private val sources = File(moduleRoot, "feature/chat/src/main/kotlin/me/meeshy/app/chat")

    private val pattern = Regex("""<(?:string|plurals) name="([^"]+)"[^>]*>(.*?)</(?:string|plurals)>""", RegexOption.DOT_MATCHES_ALL)

    private fun unescape(raw: String) = raw.replace("\\'", "'").replace("&amp;", "&")

    private fun all(folder: String): Map<String, String> =
        File(resDir, folder).listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            pattern.findAll(file.readText()).map { it.groupValues[1] to unescape(it.groupValues[2]) }.toList()
        }.toMap()

    private fun epure(folder: String): Map<String, String> {
        val file = File(resDir, "$folder/strings_epure_liste_fil_17697.xml")
        assertWithMessage("$folder/strings_epure_liste_fil_17697.xml").that(file.isFile).isTrue()
        return pattern.findAll(file.readText()).associate { it.groupValues[1] to unescape(it.groupValues[2]) }
    }

    private fun source(path: String) = File(sources, path).readText()

    private val removed = listOf(
        "add_participant_prompt", "message_detail_edits_none_detail", "message_detail_edits_empty", "share_empty_body",
        "a11y_message_location", "chat_attach_file", "chat_call_rejoin_a11y", "chat_call_video", "chat_camera_chooser_photo",
        "chat_camera_chooser_title", "chat_camera_chooser_video", "chat_composer_sentiment", "chat_create_share_link",
        "chat_editing_label", "chat_effect_confetti", "chat_effect_explode", "chat_effect_fireworks", "chat_effect_glow",
        "chat_effect_pulse", "chat_effect_rainbow", "chat_effect_shake", "chat_effect_sparkle", "chat_effect_waoo",
        "chat_effect_zoom", "chat_effects_chip_a11y", "chat_effects_clear_all", "chat_effects_done", "chat_effects_duration_a11y",
        "chat_effects_ephemeral_duration", "chat_effects_section_behavior", "chat_effects_section_entry",
        "chat_effects_section_permanent", "chat_effects_title", "chat_explorer_original", "chat_forward_empty",
        "chat_forward_search_hint", "chat_forward_send_a11y", "chat_forward_sent", "chat_forward_title", "chat_header_call_hint",
        "chat_header_collapse", "chat_header_expand", "chat_message_actions", "chat_react_with", "chat_reactions_empty",
        "chat_search", "conversation_analysis_dynamic", "conversation_analysis_emotions", "conversation_analysis_empty",
        "conversation_analysis_error", "conversation_analysis_health", "conversation_analysis_summary", "conversation_analysis_tone",
        "conversation_analysis_topics", "conversation_members_add_a11y", "conversation_members_open", "conversation_options_block_a11y",
        "conversation_stats_participants", "conversation_stats_title", "encryption_detail_details_header", "encryption_done",
        "media_hub_all_loaded", "participant_profile_error", "participant_profile_history_failed", "participant_profile_history_label",
        "participant_profile_joined", "participant_profile_via_link", "share_target_preview_title", "share_target_search_hint",
        "share_target_send", "share_target_sent", "share_target_title", "share_toast_published",
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
    fun `no label of the module is left without a reader`() {
        val readers = moduleRoot.walkTopDown()
            .onEnter { it.name !in setOf("build", ".gradle", "node_modules", "test", "androidTest") }
            .filter { it.isFile && it.extension in setOf("kt", "xml", "java") }
            .filterNot { it.path.contains("/res/values") && Regex("""/(strings|plurals|arrays|composer)[^/]*\.xml$""").containsMatchIn(it.path) }
            .flatMap { Regex("""[A-Za-z_][A-Za-z0-9_]*""").findAll(it.readText()).map { m -> m.value } }
            .toSet()
        val orphans = File(resDir, "values").listFiles { f -> f.extension == "xml" }.orEmpty()
            .flatMap { pattern.findAll(it.readText()).map { m -> m.groupValues[1] }.toList() }
            .filterNot { it in readers }
        assertWithMessage("clés sans lecteur").that(orphans).isEmpty()
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
            epure(folder).filter { (key, text) -> text == french[key] }.keys.map { "$folder:$it" }
        }
        assertThat(copies).isEmpty()
    }

    @Test
    fun `the member card says Allowed languages, Asked on arrival and e-mail like the link card`() {
        val fr = all("values-fr")
        assertThat(fr["participant_profile_entry_link_languages"]).isEqualTo("Langues autorisées")
        assertThat(fr["participant_profile_entry_link_requires"]).isEqualTo("Demandé à l’arrivée")
        assertThat(fr["participant_profile_require_email"]).isEqualTo("e-mail")
        assertThat(all("values-de")["participant_profile_require_email"]).isEqualTo("E-Mail")
        assertThat(all("values-es")["participant_profile_require_email"]).isEqualTo("correo")
    }

    @Test
    fun `adding a member has no prompt that the field already says`() {
        assertThat(source("AddParticipantSheet.kt")).doesNotContain("add_participant_prompt")
    }

    @Test
    fun `an unedited message says No edit once, with no second line`() {
        val history = source("MessageHistorySentimentSheets.kt")
        assertThat(history).doesNotContain("message_detail_edits_none_detail")
        assertThat(history).doesNotContain("message_detail_edits_empty")
        assertThat(history).contains("message_detail_edits_none_title")
        assertThat(all("values-fr")["message_detail_edits_none_title"]).isEqualTo("Aucune modification")
    }

    @Test
    fun `sharing with nobody found says one line, the search field already says what to type`() {
        assertThat(source("share/ShareRecipientsZone.kt")).doesNotContain("share_empty_body")
        assertThat(source("ShareSheet.kt")).doesNotContain("share_empty_body")
        assertThat(all("values-fr")["share_empty_title"]).isEqualTo("Personne ici pour l’instant")
    }

    @Test
    fun `a protected message refusal lets the title carry the consequence`() {
        val fr = all("values-fr")
        assertThat(fr["chat_exit_blocked_title"]).isEqualTo("Ce message ne sort pas de Meeshy")
        listOf("chat_exit_blocked_view_once", "share_blocked_view_once").forEach {
            assertThat(fr[it]).isEqualTo("Il est à vue unique : il reste ici, le temps d’être vu.")
        }
        listOf("chat_exit_blocked_after_read", "share_blocked_after_read").forEach {
            assertThat(fr[it]).isEqualTo("Il disparaît après lecture.")
        }
        folders.forEach { folder ->
            val strings = all(folder)
            assertWithMessage(folder).that(strings.getValue("chat_exit_blocked_view_once")).isEqualTo(strings.getValue("share_blocked_view_once"))
            assertWithMessage(folder).that(strings.getValue("chat_exit_blocked_after_read")).isEqualTo(strings.getValue("share_blocked_after_read"))
        }
    }

    @Test
    fun `the irreversibility of end to end encryption stays whole and visible`() {
        assertThat(all("values-fr")["encryption_irreversible_refused"])
            .isEqualTo("Le chiffrement de bout en bout ne se désactive pas. Pour échanger sans lui, créez une nouvelle conversation.")
        folders.forEach { folder -> assertThat(all(folder)["encryption_irreversible_refused"]).isNotEmpty() }
    }
}
