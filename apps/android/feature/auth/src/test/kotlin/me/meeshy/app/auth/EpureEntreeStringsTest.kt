package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * L'épure des écrans d'entrée (#17675) : un libellé nomme, il n'explique pas, et ce qui n'a plus de lecteur
 * quitte les sept dossiers dans le même commit. Les chaînes touchées vivent dans `strings_epure_android.xml`,
 * hors du générateur iOS, traduites — jamais recopiées du français.
 */
class EpureEntreeStringsTest {

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val resDir: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .map { File(it, "feature/auth/src/main/res") }
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
        "auth_magic_header", "auth_magic_how_label", "auth_magic_sent_code_and_link", "auth_magic_sent",
        "signup_subtitle", "email_verification_no_code", "session_closed_expired_message", "email_gate_label",
        "share_link_choose_subtitle", "share_link_choose_subtitle_generic",
        "guest_join_username_optional", "guest_join_email_optional", "guest_join_optional_section",
        "onboarding_email_waiting", "onboarding_friends_pending", "onboarding_global_hint", "onboarding_story_sending_detail",
        "signup_card_title", "signup_password_why", "onboarding_story_verify_detail",
        "onboarding_profile_benefit_visibility", "onboarding_profile_benefit_contacts",
        "login_welcome_back", "signup_choose_country", "signup_submit", "auth_magic_countdown",
        "auth_login_two_factor_description", "email_verification_nav_title", "onboarding_languages_failed", "signup_back",
        "signup_display_name_label", "signup_email_label", "signup_error_generic", "signup_password_hide",
        "signup_password_label", "signup_password_show", "world_entry_name_label",
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
            epure(folder).filter { (key, text) -> text == french[key] }.keys.map { "$folder:$it" }
        }
        assertThat(copies).isEmpty()
    }

    @Test
    fun `the shortened French labels keep within 80 characters but the security sentences`() {
        val securitySentences = setOf("link_switch_message", "link_switch_message_unknown_current", "link_signin_message", "link_signin_message_replacing")
        val long = epure("values-fr").filter { (key, text) -> key !in securitySentences && text.length > 80 }
        assertThat(long.keys).isEmpty()
    }

    @Test
    fun `a link that opens another account keeps its warning in every language`() {
        folders.forEach { folder ->
            val strings = epure(folder)
            assertThat(strings.getValue("link_switch_message")).contains("%1\$s")
            assertThat(strings.getValue("link_switch_message")).contains("%2\$s")
            assertThat(strings.getValue("link_signin_message_replacing")).contains("%2\$s")
        }
    }

    @Test
    fun `the French entry screens read as the lexicon and the brief say`() {
        val fr = all("values-fr")
        assertThat(fr["welcome_tagline"]).isEqualTo("Chaque message, dans votre langue.")
        assertThat(fr["login_two_factor_description_with_backup"])
            .isEqualTo("Entrez le code à 6 chiffres de votre application d'authentification, ou un code de secours.")
        assertThat(fr["auth_magic_subtitle"]).isEqualTo("Pas de mot de passe : nous envoyons un lien par e-mail.")
        assertThat(fr["auth_magic_sent_title"]).isEqualTo("Code et lien envoyés")
        assertThat(fr["auth_forgot_sent_title"]).isEqualTo("Lien envoyé")
        assertThat(fr["signup_password_why_detail"]).isEqualTo("Sans mot de passe, vous vous connectez par un lien reçu par e-mail.")
        assertThat(fr["onboarding_story_verify"]).isEqualTo("Confirme ton e-mail pour publier ta story")
        assertThat(fr["email_verification_title"]).isEqualTo("Vérifiez votre e-mail")
        assertThat(fr["email_verification_success"]).isEqualTo("E-mail vérifié !")
        assertThat(fr["email_verification_code_a11y_hint"]).isEqualTo("Entrez le code à 6 chiffres reçu par e-mail")
        assertThat(fr["link_signin_message_replacing"]).isEqualTo(
            "Ce lien n'a pas été demandé depuis cet appareil. Il remplace %2\$s, qui reste au sélecteur de comptes. Continuez seulement s'il vous appartient.",
        )
        assertThat(fr["signup_phone_conflict"]).isEqualTo("Numéro déjà rattaché à un compte : laissez-le vide pour continuer.")
        assertThat(fr["signup_display_name_invalid_characters"]).isEqualTo("Lettres, espaces, apostrophes, points et tirets uniquement.")
        assertThat(fr["email_verification_subtitle_account_created"]).isEqualTo("Compte créé. Code et lien envoyés à <b>%1\$s</b>.")
        assertThat(fr["session_closed_admin_title"]).isEqualTo("Session fermée par l'équipe Meeshy")
        assertThat(fr["session_closed_admin_message"]).isEqualTo("Pour protéger votre compte.")
        assertThat(fr["session_closed_signed_out_message"]).isEqualTo("Cette session a été fermée.")
        assertThat(fr["activation_invite_days_left"]).isEqualTo("Encore %1\$d jours : ensuite, la connexion demandera un code.")
        assertThat(fr["email_gate_sent"]).isEqualTo("Code envoyé à %1\$s.")
        assertThat(fr["onboarding_friends_body"]).isEqualTo("Ajoute 3 personnes qui te ressemblent.")
        assertThat(fr["onboarding_story_body"]).isEqualTo("Une photo, un mot : une story.")
        assertThat(fr["onboarding_recap_tomorrow"]).isEqualTo("Demain, ta Flamme brûlera depuis %1\$d jours.")
        assertThat(fr["onboarding_age_body"]).isEqualTo("Pour te proposer les bons espaces.")
    }

    @Test
    fun `what stays visible at rest is still said once`() {
        val fr = all("values-fr")
        assertThat(fr["onboarding_contacts_offer_promise"]).isEqualTo("Personne n'est contacté à ta place.")
        assertThat(fr["onboarding_friends_badge"]).isEqualTo("+%1\$d chacun")
        assertThat(fr["onboarding_story_badge"]).isEqualTo("24 h")
        assertThat(fr["onboarding_age_picker_hint"]).isNotEmpty()
        assertThat(fr["signup_language_pill"]).isNotEmpty()
    }

    @Test
    fun `two consecutive onboarding cards no longer share a title and the story one is translated`() {
        folders.forEach { folder ->
            val strings = all(folder)
            assertThat(strings.getValue("onboarding_story_title")).isNotEqualTo(strings.getValue("onboarding_profile_title"))
        }
        assertThat(all("values")["onboarding_story_title"]).isEqualTo("Your story")
        assertThat(all("values-fr")["onboarding_story_title"]).isEqualTo("Ta story")
        val english = all("values").getValue("onboarding_story_title")
        folders.drop(1).filterNot { it == "values-fr" }.forEach { folder ->
            assertWithMessage(folder).that(all(folder).getValue("onboarding_story_title")).isNotEqualTo(english)
        }
    }

    @Test
    fun `the activation invitation lead is a sentence of its own that names the code`() {
        assertThat(all("values")["activation_invite_lead"]).isEqualTo("Verify your email or phone to keep signing in without a code.")
        assertThat(all("values-fr")["activation_invite_lead"]).isEqualTo("Vérifiez votre e-mail ou votre téléphone pour vous connecter sans code.")
        val english = all("values").getValue("activation_invite_lead")
        folders.drop(1).forEach { folder ->
            val lead = all(folder).getValue("activation_invite_lead")
            assertWithMessage(folder).that(lead).isNotEqualTo(english)
            assertWithMessage(folder).that(lead.length).isGreaterThan(30)
        }
    }

    @Test
    fun `the e-mail is spelled the lexicon way in French and Italian`() {
        val banned = Regex("""(?i)(?<![-\p{L}])(email|courriel)(?![\p{L}])""")
        listOf("values-fr", "values-it").forEach { folder ->
            val offenders = all(folder).filter { (key, text) -> key.startsWith("email_verification") || key == "onboarding_story_verify" }
                .filter { banned.containsMatchIn(it.value) }.keys
            assertWithMessage("$folder").that(offenders).isEmpty()
        }
    }

    @Test
    fun `the unused app label is gone as well`() {
        val appRes = File(resDir.parentFile.parentFile.parentFile.parentFile, "app/src/main/res")
        folders.forEach { folder ->
            val dir = File(appRes, folder)
            val keys = dir.listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { pattern.findAll(it.readText()).map { m -> m.groupValues[1] }.toList() }
            assertThat(keys).doesNotContain("login_welcome_back")
        }
    }
}
