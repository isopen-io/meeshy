package me.meeshy.app.settings

import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Changer d'adresse et supprimer son compte envoient un e-mail : les deux écrans disent de
 * regarder les indésirables (#16937), avec LA ligne partagée de :sdk-ui.
 */
class EmailSentSpamHintSurfacesTest {

    private val sources = File("src/main/kotlin/me/meeshy/app/settings")

    @Test
    fun `every email-sent settings surface mounts the shared spam line`() {
        listOf("SecurityEmailSection.kt", "AccountDeletionScreen.kt").forEach { file ->
            assertWithMessage(file).that(File(sources, file).readText()).contains("SpamFolderHint(")
        }
    }
}
