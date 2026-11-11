package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import me.meeshy.app.settings.SettingsResourceTree as Tree
import org.junit.Test

/**
 * L'épure des réglages Android (#17659, épure #17584) : ce que les écrans énoncent, dans les sept langues.
 * Un libellé nomme, une phrase d'orientation reste visible pour ce qui est propre à Meeshy, l'explication
 * passe derrière un (i) dont le nom est une QUESTION, et aucune clé n'est orpheline.
 */
class EpureReglagesStringsTest {

    private val allLocales: List<String?> = listOf<String?>(null) + Tree.locales

    private fun fr(name: String): String = Tree.entriesOf("fr").getValue(name).text.replace("\\'", "'")

    @Test
    fun `the usual labels are single names taken from the lexicon`() {
        assertThat(fr("settings_packs_title")).isEqualTo("Boutique")
        assertThat(fr("settings_notif_more_options")).isEqualTo("Plus")
        assertThat(fr("settings_dnd_day_sun")).isEqualTo("Dim")
        assertThat(fr("settings_interface_lentille_list")).isEqualTo("Liste Lentille")
        assertThat(fr("settings_interface_riviere_mode")).isEqualTo("Mode Rivière")
        assertThat(fr("twofactor_enable_button")).isEqualTo("Activer")
        assertThat(fr("twofactor_disable_button")).isEqualTo("Désactiver")
        assertThat(fr("twofactor_status_disabled")).isEqualTo("Désactivée")
        assertThat(fr("security_sessions_manage")).isEqualTo("Sessions actives")
        assertThat(fr("settings_privacy_notify_contacts_on_return")).isEqualTo("Annoncer mon retour")
        assertThat(fr("settings_privacy_hide_from_contact_search")).isEqualTo("Masquer mon numéro et mon e-mail")
        assertThat(fr("settings_notif_type_contact_activity")).isEqualTo("Retour d'un contact")
        assertThat(fr("support_link_email")).isEqualTo("E-mail")
        assertThat(fr("pack_shop_state_embedded")).isEqualTo("Inclus")
        assertThat(fr("settings_media_capture_rendered_title")).isEqualTo("Enregistrer la version retouchée")
    }

    @Test
    fun `the master PIN has one name in french`() {
        val frenchValues = Tree.files("fr").flatMap(Tree::entries).map { it.text }
        assertThat(frenchValues.filter { it.contains("master PIN", ignoreCase = true) }).isEmpty()
        assertThat(fr("security_lock_master_pin")).isEqualTo("Code PIN principal")
    }

    @Test
    fun `a label that repeated its title is gone from every locale`() {
        val gone = listOf(
            "data_storage_cache_subtitle", "media_download_info", "settings_media_capture_original_subtitle",
            "settings_media_capture_rendered_subtitle", "sessions_empty_subtitle", "sessions_offline_title",
            "sessions_offline_subtitle", "sessions_error_subtitle", "sessions_load_error", "sessions_revoke_others",
            "sessions_current_badge", "sessions_place_approximate", "encrypted_devices_empty_title",
            "encrypted_devices_empty_body", "settings_privacy_read_receipts_info", "privacy_encryption_disabled",
            "privacy_encryption_coming_soon", "purge_unattributed_description", "crash_reports_info_title",
            "crash_reports_info_body", "data_export_info_title", "about_description_body", "about_section_description",
            "licenses_intro", "pack_shop_detail_embedded", "pack_shop_detail_embedded_size",
            "privacy_block_screenshots", "privacy_contact_requests", "privacy_group_invites", "privacy_share_data",
            "settings_privacy_coming_soon", "settings_privacy_coming_soon_a11y", "purge_unattributed_label",
        )
        allLocales.forEach { locale ->
            val keys = Tree.entriesOf(locale).keys
            assertWithMessage("clés disparues encore présentes en ${locale ?: "en"}").that(keys.intersect(gone.toSet())).isEmpty()
        }
    }

    @Test
    fun `every note behind an info button is named by a question in each language`() {
        val questions = listOf(
            "data_storage_cache_question", "settings_media_capture_original_question", "settings_media_capture_rendered_question",
            "settings_media_autosave_question", "settings_privacy_online_status_question",
            "settings_privacy_notify_contacts_on_return_question", "settings_privacy_hide_from_contact_search_question",
            "settings_privacy_calls_non_contacts_question", "settings_privacy_analytics_question", "purge_unattributed_question",
            "purge_limitation_question", "crash_reports_question",
        )
        allLocales.forEach { locale ->
            val entries = Tree.entriesOf(locale)
            questions.forEach { name ->
                val text = entries.getValue(name).text.trim()
                assertWithMessage("$name en ${locale ?: "en"} est une question").that(text.last() in listOf('?', '؟')).isTrue()
            }
        }
    }

    @Test
    fun `what is specific to Meeshy keeps a sentence visible at rest in each language`() {
        val orientations = listOf(
            "settings_voice_orientation", "settings_tools_progression_orientation", "settings_share_links_orientation",
            "settings_security_orientation", "settings_transcription_orientation", "settings_languages_orientation",
            "settings_interface_lentille_list_subtitle", "settings_interface_riviere_mode_subtitle", "twofactor_orientation",
            "security_lock_orientation", "security_e2ee_orientation", "security_sessions_orientation", "sessions_orientation",
            "encrypted_devices_orientation", "settings_privacy_online_status_subtitle",
            "settings_privacy_notify_contacts_on_return_subtitle", "settings_privacy_hide_from_contact_search_subtitle",
            "privacy_read_receipts_subtitle", "privacy_encryption_summary", "crash_reports_privacy", "about_tagline",
        )
        allLocales.forEach { locale ->
            val entries = Tree.entriesOf(locale)
            orientations.forEach { name ->
                assertWithMessage("$name en ${locale ?: "en"}").that(entries.getValue(name).text.trim()).isNotEmpty()
            }
        }
        assertThat(fr("sessions_orientation"))
            .isEqualTo("Appareils connectés à votre compte. Déconnectez ceux que vous ne reconnaissez pas.")
        assertThat(fr("twofactor_orientation")).startsWith("Un code de votre application s'ajoute au mot de passe.")
        assertThat(fr("settings_voice_orientation"))
            .isEqualTo("Votre voix clonée traduit vos vocaux. Elle demande votre consentement.")
        assertThat(fr("encrypted_devices_last_seen")).isEqualTo("Dernier usage : %1\$s")
    }

    @Test
    fun `a state is one line`() {
        assertThat(fr("sessions_state_offline")).doesNotContain("\n")
        assertThat(fr("encrypted_devices_empty")).isEqualTo("Aucun appareil chiffré : il apparaît ici dès que Meeshy y active le chiffrement.")
        assertThat(fr("crash_reports_empty")).isEqualTo("Aucun rapport.")
        assertThat(fr("encrypted_devices_retire_changed").length).isAtMost(80)
        assertThat(fr("twofactor_regenerate_warning")).isEqualTo("Les nouveaux codes remplacent les anciens.")
        assertThat(fr("twofactor_disable_warning")).isEqualTo("Votre compte sera moins sécurisé sans 2FA.")
    }

    @Test
    fun `no string is left without a reader`() {
        val androidRoot = Tree.androidRoot()
        val sources = (Tree.kotlinSources() + File(androidRoot, "app/src/main").walkTopDown().filter { it.extension == "kt" }.toList())
            .joinToString("\n") { it.readText() }
        val read = Regex("""R\.(?:string|plurals|array)\.(\w+)""").findAll(sources).map { it.groupValues[1] }.toSet()
        val orphans = Tree.entriesOf(null).keys.filterNot { it in read }
        assertWithMessage("clés sans lecteur").that(orphans).isEmpty()
    }

    @Test
    fun `the new strings live in one hand written file per locale and are not adopted from iOS`() {
        allLocales.forEach { locale ->
            val file = File(Tree.resDir(), "${Tree.folder(locale)}/strings_epure_android.xml")
            assertWithMessage("fichier de ${locale ?: "en"}").that(file.isFile).isTrue()
        }
    }
}
