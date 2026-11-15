package me.meeshy.ui.icons

import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

class DirectIconUsageRatchetTest {
    private val root = IconsTestSupport.androidRoot
    private val iconsPackageDir = "sdk-ui/src/main/kotlin/me/meeshy/ui/icons/"
    private val directImport = Regex("^import androidx\\.compose\\.material\\.icons\\.", RegexOption.MULTILINE)

    private fun filesImportingIconsDirectly(): Set<String> =
        root.walkTopDown()
            .onEnter { it.name != "build" && it.name != ".gradle" && it.name != ".git" }
            .filter { it.isFile && it.extension == "kt" }
            .map { it.relativeTo(root).invariantSeparatorsPath }
            .filterNot { it.startsWith(iconsPackageDir) }
            .filter { directImport.containsMatchIn(File(root, it).readText()) }
            .toSet()

    private fun baseline(): Set<String> =
        File(root, "sdk-ui/src/test/resources/icons/direct-icon-usage-baseline.txt")
            .readLines().map { it.trim() }.filter { it.isNotEmpty() && !it.startsWith("#") }.toSet()

    @Test fun `aucun nouveau fichier n'importe les icones Material hors du paquet icons`() {
        val offenders = filesImportingIconsDirectly() - baseline()
        assertWithMessage(
            "Nouvel import direct d'androidx.compose.material.icons.* : utiliser MeeshyIcons " +
                "(sdk-ui/.../icons). Fichiers : $offenders",
        ).that(offenders).isEmpty()
    }

    @Test fun `le nombre de fichiers a import direct ne depasse pas la baseline`() {
        assertWithMessage("cliquet : le nombre ne peut que baisser")
            .that(filesImportingIconsDirectly().size).isAtMost(baseline().size)
    }
}
