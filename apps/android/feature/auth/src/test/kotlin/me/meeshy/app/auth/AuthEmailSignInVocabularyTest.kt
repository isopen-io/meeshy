package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * La connexion par e-mail se lit « par e-mail », jamais « lien magique » (#6626).
 *
 * L'utilisateur a besoin de savoir qu'il se connecte par e-mail, pas le nom de la
 * mécanique : aucune valeur VISIBLE des ressources de `:feature:auth` ne dit plus
 * « magique » / « magic » / « mágico », dans aucune langue livrée. Les clés et les
 * routes gardent leur nom interne — seul ce que l'écran affiche change.
 *
 * Le vocabulaire est IMPOSÉ et identique sur les trois clients (iOS, web-v2,
 * Android) : les valeurs FR et EN sont donc vérifiées mot pour mot, et chaque clé
 * de base doit exister dans chaque langue livrée pour qu'un (i) ne tombe jamais
 * sur l'anglais par défaut.
 */
class AuthEmailSignInVocabularyTest {

    private val shippedLocales = listOf("fr", "es", "pt")

    private fun resDir(): File {
        val fromWorkingDir = File("src/main/res")
        if (fromWorkingDir.isDirectory) return fromWorkingDir
        val fromModule = File("feature/auth/src/main/res")
        check(fromModule.isDirectory) {
            "could not locate feature/auth res dir from ${File("").absolutePath}"
        }
        return fromModule
    }

    private val stringPattern =
        Regex("<string\\s+name=\"([^\"]+)\"\\s*>(.*?)</string>", RegexOption.DOT_MATCHES_ALL)

    private val formatSpecifier = Regex("%(\\d+\\\$)?[sdf]")

    private fun strings(locale: String?): Map<String, String> {
        val dir = if (locale == null) "values" else "values-$locale"
        val file = File(resDir(), "$dir/strings.xml")
        check(file.isFile) { "missing strings file: ${file.path}" }
        return stringPattern.findAll(file.readText())
            .associate { it.groupValues[1] to it.groupValues[2].replace("\\'", "'") }
    }

    @Test
    fun `no visible auth string says magic in any shipped language`() {
        val offenders = (listOf<String?>(null) + shippedLocales).flatMap { locale ->
            strings(locale)
                .filterValues { it.contains("magi", ignoreCase = true) || it.contains("mági", ignoreCase = true) }
                .map { (key, value) -> "${locale ?: "base"}:$key=$value" }
        }

        assertThat(offenders).isEmpty()
    }

    @Test
    fun `english email sign-in vocabulary matches the other clients`() {
        assertThat(strings(null)).containsAtLeastEntriesIn(
            mapOf(
                "login_magic_link" to "Sign in with email",
                "auth_magic_title" to "Email sign-in",
                "auth_magic_header" to "Your email address",
                "auth_magic_how_label" to "How it works",
                "auth_magic_subtitle" to "No password to remember: we email you a link. Open it and you're signed in.",
                "auth_magic_send" to "Get the link",
                "auth_magic_resend" to "Resend the link",
                "auth_magic_sent_title" to "Email sent",
                "auth_magic_sent" to "Open the link sent to %1\$s",
                "auth_magic_nothing_label" to "Nothing received?",
                "auth_magic_nothing_text" to "Check your spam folder: the message may have landed there.",
            ),
        )
    }

    @Test
    fun `french email sign-in vocabulary matches the other clients`() {
        assertThat(strings("fr")).containsAtLeastEntriesIn(
            mapOf(
                "login_magic_link" to "Se connecter par e-mail",
                "auth_magic_title" to "Connexion par e-mail",
                "auth_magic_header" to "Votre adresse e-mail",
                "auth_magic_how_label" to "Comment ça marche",
                "auth_magic_subtitle" to "Pas de mot de passe à retenir : nous vous envoyons un lien par e-mail. Ouvrez-le et vous êtes connecté.",
                "auth_magic_send" to "Recevoir le lien",
                "auth_magic_resend" to "Renvoyer le lien",
                "auth_magic_sent_title" to "E-mail envoyé",
                "auth_magic_sent" to "Ouvrez le lien reçu à %1\$s",
                "auth_magic_nothing_label" to "Rien reçu ?",
                "auth_magic_nothing_text" to "Regardez vos indésirables (spam) : le message peut y être tombé.",
            ),
        )
    }

    @Test
    fun `every base auth string is translated in every shipped language`() {
        val baseKeys = strings(null).keys

        val gaps = shippedLocales.associateWith { locale -> baseKeys - strings(locale).keys }
            .filterValues { it.isNotEmpty() }

        assertThat(gaps).isEmpty()
    }

    @Test
    fun `translated auth strings keep the base format specifiers`() {
        val base = strings(null)

        val mismatches = shippedLocales.flatMap { locale ->
            val translated = strings(locale)
            base.mapNotNull { (key, baseValue) ->
                val translatedValue = translated[key] ?: return@mapNotNull null
                val expected = formatSpecifier.findAll(baseValue).map { it.value }.sorted().toList()
                val actual = formatSpecifier.findAll(translatedValue).map { it.value }.sorted().toList()
                if (expected == actual) null else "$locale:$key expected=$expected actual=$actual"
            }
        }

        assertThat(mismatches).isEmpty()
    }
}
