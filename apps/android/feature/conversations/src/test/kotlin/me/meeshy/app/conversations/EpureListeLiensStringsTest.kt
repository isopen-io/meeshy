package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import me.meeshy.sdk.model.lock.LockPinCopy
import org.junit.Test

/**
 * Épure 1/3 de la liste et des liens (#17697, épure #17584) : le hub, le suivi, les communautés et le
 * parrainage prennent les mots du lexique (`docs/product/epure-lexique.md`), les en-têtes qui redisent le
 * titre et les sous-titres qui redisent la question partent, ce qui n'a plus de lecteur quitte les sept
 * dossiers, et ce qui est PROPRE À MEESHY garde, visible au repos, la phrase qui dit ce que c'est (règle 7).
 */
class EpureListeLiensStringsTest {

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val moduleRoot: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .first { File(it, "feature/conversations/src/main/res").isDirectory }

    private val resDir = File(moduleRoot, "feature/conversations/src/main/res")
    private val sources = File(moduleRoot, "feature/conversations/src/main/kotlin/me/meeshy/app/conversations")

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
        "links_hub_banner_subtitle", "links_affiliate_section_my_links", "links_tracking_section_my_links",
        "links_community_section_mine", "links_tracking_create_token_help", "my_share_links_section",
        "shareLink_detail_guestRights", "shareLink_detail_entryConditions",
        "conversations_lock_subtitle_confirm_master", "conversations_lock_subtitle_confirm_new",
        "conversations_lock_subtitle_remove_master",
        "context_call", "context_search", "conversations_action_delete_for_me", "conversations_action_favorite",
        "conversations_action_leave", "conversations_action_remove_category", "conversations_action_rename",
        "conversations_badge_muted", "conversations_banner_connecting", "conversations_banner_offline",
        "conversations_banner_online", "conversations_banner_reconnecting", "conversations_banner_syncing",
        "conversations_contacts", "conversations_delete_for_me_confirm_button", "conversations_delete_for_me_confirm_message",
        "conversations_delete_for_me_confirm_title", "conversations_leave_confirm_button", "conversations_leave_confirm_message",
        "conversations_leave_confirm_title", "conversations_logout", "conversations_rename_dialog_title",
        "conversations_rename_field_label", "conversations_search", "conversations_search_close", "global_search_recent_remove",
        "global_search_summary_ephemeral", "global_search_tab_conversations", "links_affiliate_stat_links",
        "links_affiliate_stat_signups", "links_community_stat_groups", "links_community_stat_members",
        "links_tracking_stats_clicks", "links_tracking_stats_links", "my_share_links_retry", "my_share_links_stats_total",
        "my_share_links_stats_uses", "my_share_links_toggle", "new_conversation_search_hint", "row_a11y_conversation_with",
        "row_a11y_last_message", "row_a11y_muted", "row_a11y_opens_conversation", "row_a11y_pinned", "share_link_detail_created",
        "share_link_detail_dismiss", "share_link_detail_expires", "share_link_detail_identifier", "share_link_detail_info_title",
        "share_link_detail_open", "share_link_detail_stats_max", "share_link_detail_stats_title", "share_link_detail_stats_uses",
        "share_link_field_max_uses", "share_link_picker_back", "swipe_hide", "swipe_mute", "swipe_unmute",
        "conversations_badge_pinned",
    )

    private val sameWordInFrench = emptySet<String>()

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
        val androidRoot = File(moduleRoot, "")
        val readers = androidRoot.walkTopDown()
            .onEnter { it.name !in setOf("build", ".gradle", "node_modules", "test", "androidTest") }
            .filter { it.isFile && it.extension in setOf("kt", "xml", "java") }
            .filterNot { it.path.contains("/res/values") && Regex("""/(strings|plurals|arrays)[^/]*\.xml$""").containsMatchIn(it.path) }
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
            epure(folder).filter { (key, text) -> text == french[key] && key !in sameWordInFrench }.keys.map { "$folder:$it" }
        }
        assertThat(copies).isEmpty()
    }

    @Test
    fun `the hub drops its banner, and the referral and tracking cards are said with the words of the web`() {
        val fr = all("values-fr")
        assertThat(source("links/LinksHubScreen.kt")).doesNotContain("links_hub_banner")
        assertThat(fr["links_hub_affiliate_description"]).isEqualTo("Invitez votre réseau sur Meeshy et suivez vos inscrits")
        assertThat(fr["links_hub_tracking_description"]).isEqualTo("Suivez les clics et les campagnes de vos liens")
        assertThat(fr["links_hub_affiliate_create_a11y"]).isEqualTo("Créer un lien de parrainage")
        assertThat(fr["links_hub_tracking_create_a11y"]).isEqualTo("Créer un lien de suivi")
        assertThat(fr["links_tracking_create_a11y"]).isEqualTo("Créer un lien de suivi")
        assertThat(all("values")["links_hub_affiliate_description"]).isEqualTo("Invite your network to Meeshy and follow who signs up")
    }

    @Test
    fun `tracking is Suivi everywhere in French, communities is Communautes`() {
        val fr = all("values-fr")
        assertThat(fr["links_tracking_empty_title"]).isEqualTo("Aucun lien de suivi")
        assertThat(fr["links_tracking_create_title"]).isEqualTo("Nouveau lien de suivi")
        assertThat(fr["links_community_title"]).isEqualTo("Communautés")
        assertThat(all("values")["links_community_title"]).isEqualTo("Communities")
        assertThat(fr.values.filter { it.contains("tracking", ignoreCase = true) }).isEmpty()
    }

    @Test
    fun `a section header that repeats the screen title is gone from the three link screens and the share links list`() {
        listOf("links/AffiliateScreen.kt", "links/TrackingLinksScreen.kt", "links/CommunityLinksScreen.kt").forEach { path ->
            assertWithMessage(path).that(source(path)).doesNotContain("LinksSectionTitle")
        }
        assertThat(source("MyShareLinksScreen.kt")).doesNotContain("my_share_links_section")
    }

    @Test
    fun `the referral screen says at rest what a referral link allows`() {
        val screen = source("links/AffiliateScreen.kt")
        val body = screen.substringBefore("private fun TokenRow")
        assertThat(body).contains("R.string.links_affiliate_intro")
        assertThat(screen.substringAfter("private fun AffiliateCreateSheet")).doesNotContain("links_affiliate_intro")
        assertThat(all("values-fr")["links_affiliate_intro"]).isEqualTo("Qui s’inscrit sur Meeshy par ce lien devient votre filleul.")
    }

    @Test
    fun `the new referral link names itself and the cap says what happens beyond it`() {
        val fr = all("values-fr")
        assertThat(fr["links_affiliate_create_title"]).isEqualTo("Nouveau lien de parrainage")
        assertThat(fr["links_affiliate_create_max_uses_label"]).isEqualTo("Limiter les inscriptions")
        assertThat(fr["links_affiliate_create_max_uses_note"]).isEqualTo("Au-delà, le lien n’inscrit plus personne")
        assertThat(source("links/AffiliateScreen.kt")).contains("R.string.links_affiliate_create_max_uses_note")
    }

    @Test
    fun `a referral row and a tracking row carry what lets one recognise the link`() {
        val fr = all("values-fr")
        assertThat(fr["links_common_created"]).isEqualTo("Créé le %1\$s")
        assertThat(fr["links_affiliate_row_uses"]).isEqualTo("%1\$d sur %2\$d")
        assertThat(fr["links_tracking_detail_last_click"]).isEqualTo("Dernier clic : %1\$s")
        assertThat(source("links/AffiliateScreen.kt")).contains("affiliateRowFactsText(token)")
        assertThat(source("links/TrackingLinksScreen.kt")).contains("trackingRowDateText(link)")
    }

    @Test
    fun `deleting a referral link asks first and says what it costs`() {
        val fr = all("values-fr")
        assertThat(fr["links_affiliate_delete_title"]).isEqualTo("Supprimer ce lien de parrainage ?")
        assertThat(fr["links_affiliate_delete_body"])
            .isEqualTo("Il ne permettra plus de s’inscrire en votre nom. Vos filleuls restent les vôtres.")
        val screen = source("links/AffiliateScreen.kt")
        assertThat(screen).contains("onDelete = { pendingDelete = token }")
        assertThat(screen).doesNotContain("onDelete = { viewModel.delete(token.id) }")
    }

    @Test
    fun `the tracking creation sheet has no helper under the optional token`() {
        assertThat(source("links/CreateTrackingLinkSheet.kt")).doesNotContain("links_tracking_create_token_help")
    }

    @Test
    fun `the guest sections of the link card and the edit form are the lexicon words Allow and Ask guests`() {
        val fr = all("values-fr")
        assertThat(fr["share_link_section_permissions"]).isEqualTo("Autoriser")
        assertThat(fr["share_link_section_access"]).isEqualTo("Demander aux invités")
        listOf("ShareLinkConfigurationCard.kt", "ShareLinkEditForm.kt").forEach { path ->
            val text = source(path)
            assertWithMessage(path).that(text).contains("R.string.share_link_section_permissions")
            assertWithMessage(path).that(text).contains("R.string.share_link_section_access")
            assertWithMessage(path).that(text).doesNotContain("guestRights")
            assertWithMessage(path).that(text).doesNotContain("entryConditions")
        }
    }

    @Test
    fun `a lock code titled Confirm or Remove has no subtitle, the ones that give the code length keep theirs`() {
        val copies = listOf(LockPinCopy.CONFIRM_MASTER_PIN, LockPinCopy.CONFIRM_NEW_MASTER_PIN, LockPinCopy.REMOVE_MASTER_PIN)
        copies.forEach { assertWithMessage(it.name).that(it.subtitleRes()).isNull() }
        listOf(LockPinCopy.CREATE_MASTER_PIN, LockPinCopy.NEW_MASTER_PIN, LockPinCopy.ENTER_CODE).forEach {
            assertWithMessage(it.name).that(it.subtitleRes()).isNotNull()
        }
        assertThat(all("values-fr")["conversations_lock_subtitle_create_master"]).contains("6 chiffres")
    }

    @Test
    fun `the master PIN required dialog is two short lines`() {
        val fr = all("values-fr")
        assertThat(fr["dialogs_master_pin_title"]).isEqualTo("Master PIN requis")
        assertThat(fr["dialogs_master_pin_message"]).isEqualTo("Définissez-le dans les réglages pour verrouiller une conversation.")
        folders.forEach { folder ->
            assertWithMessage(folder).that(all(folder).getValue("dialogs_master_pin_message").length).isAtMost(70)
        }
    }
}
