package me.meeshy.app.auth

import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Chaque écran d'accès qui annonce qu'un e-mail est parti dit de regarder les indésirables (#16937),
 * avec LA ligne partagée de :sdk-ui — jamais une copie locale du texte.
 */
class EmailSentSpamHintSurfacesTest {

    private val sources = File("src/main/kotlin/me/meeshy/app/auth")

    private fun source(name: String): String = File(sources, name).readText()

    @Test
    fun `every code-by-email surface mounts the shared spam line`() {
        listOf("EmailVerificationSheet.kt", "SignupCodeStep.kt", "EmailVerificationGateSheet.kt").forEach { file ->
            assertWithMessage(file).that(source(file)).contains("SpamFolderHint(")
        }
    }

    @Test
    fun `the link-by-email surfaces keep their « Nothing received? » spam disclosure`() {
        listOf("MagicLinkSheet.kt", "AccountRecoveryScreens.kt").forEach { file ->
            assertWithMessage(file).that(source(file)).contains("R.string.auth_magic_nothing_text")
        }
    }
}
