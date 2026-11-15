package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/** La connexion par e-mail a quitté les fichiers de récupération de compte : un fichier par écran, un par modèle. */
class MagicLinkSourceSplitTest {

    private fun source(name: String): String {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "src/main/kotlin/me/meeshy/app/auth/$name")
            if (candidate.exists()) return candidate.readText()
            val fromRoot = File(dir, "feature/auth/src/main/kotlin/me/meeshy/app/auth/$name")
            if (fromRoot.exists()) return fromRoot.readText()
            dir = dir.parentFile
        }
        error("source introuvable : $name")
    }

    @Test
    fun `the recovery screens no longer hold the email sign-in`() {
        assertThat(source("AccountRecoveryScreens.kt")).doesNotContain("MagicLink")
        assertThat(source("AccountRecoveryViewModels.kt")).doesNotContain("MagicLink")
    }

    @Test
    fun `the email sign-in lives in its own sheet and view model`() {
        assertThat(source("MagicLinkSheet.kt")).contains("fun MagicLinkSheet(")
        assertThat(source("MagicLinkViewModel.kt")).contains("class MagicLinkViewModel")
    }
}
