package me.meeshy.ui.component.presentation

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Cliquet des pleins écrans (#18524).
 *
 * Un `Dialog(` brut entre avec l'animation de fenêtre du système et disparaît d'un coup quand l'hôte le retire.
 * [MeeshyCoverDialog] monte du bas, redescend, puis rend la main ; [MeeshyCoverHost] fait de même dans la fenêtre.
 * Seul `component/presentation/` garde le `Dialog(` brut. Le nombre ne fait que DESCENDRE : un lot qui migre abaisse le
 * plafond dans le même commit ; un ajout fait rougir ce test et nomme chaque occurrence.
 *
 * Le même fichier tient CoverSheet (la feuille plein écran de la navigation) sur [meeshyCoverEnter] / [meeshyCoverExit],
 * pour que « Réduire les animations » y vaille.
 */
class CoverDialogRatchetTest {

    private val skippedDirectories = setOf("build", ".gradle", ".git", ".idea", "node_modules")
    private val rawDialog = Regex("""(?<![\w.])Dialog\(""")
    private val declaration = Regex("""\bfun\s+(\w+\.)?$""")

    private fun androidRoot(): File {
        val start = File("").absoluteFile
        val direct = generateSequence(start) { it.parentFile }
            .firstOrNull { File(it, "settings.gradle.kts").isFile && File(it, "sdk-ui").isDirectory }
        if (direct != null) return direct
        val fromRepository = File(start, "apps/android")
        check(fromRepository.isDirectory) { "racine du projet Android introuvable depuis ${start.absolutePath}" }
        return fromRepository
    }

    private fun mainSources(): List<File> =
        androidRoot().walkTopDown()
            .onEnter { it.name !in skippedDirectories }
            .filter { it.isFile && it.extension == "kt" && "/src/main/" in it.invariantPath() }
            .toList()

    private fun File.invariantPath(): String = path.replace(File.separatorChar, '/')

    private fun withoutComments(source: String): String =
        source
            .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL)) { block -> "\n".repeat(block.value.count { it == '\n' }) }
            .replace(Regex("""//[^\n]*"""), "")

    internal fun rawDialogsIn(source: String): Int {
        val code = withoutComments(source)
        return rawDialog.findAll(code).count { match ->
            !declaration.containsMatchIn(code.substring(maxOf(0, match.range.first - 60), match.range.first))
        }
    }

    internal fun isOutsidePresentation(path: String): Boolean = "/component/presentation/" !in path

    private fun rawDialogs(): List<String> =
        mainSources().filter { isOutsidePresentation(it.invariantPath()) }.flatMap { file ->
            List(rawDialogsIn(file.readText())) { file.relativeTo(androidRoot()).invariantPath() }
        }

    @Test
    fun `the scan sees the sources - otherwise the guard would pass by reading nothing`() {
        val names = mainSources().map { it.name }
        assertThat(names.size).isAtLeast(300)
        assertThat(names).containsAtLeast("SheetDestination.kt", "ViewerDialog.kt")
        assertThat(rawDialogs()).isNotEmpty()
    }

    @Test
    fun `the rule counts a raw Dialog and ignores its cousins, comments and declarations`() {
        assertThat(rawDialogsIn("if (open) Dialog(onDismissRequest = {}) {}")).isEqualTo(1)
        assertThat(rawDialogsIn("AlertDialog(onDismissRequest = {})")).isEqualTo(0)
        assertThat(rawDialogsIn("DatePickerDialog(onDismissRequest = {})")).isEqualTo(0)
        assertThat(rawDialogsIn("window.Dialog(x)")).isEqualTo(0)
        assertThat(rawDialogsIn("// Dialog(\n/* Dialog( */")).isEqualTo(0)
        assertThat(rawDialogsIn("public fun Dialog(onDismissRequest: () -> Unit) {}")).isEqualTo(0)
        assertThat(isOutsidePresentation("sdk-ui/src/main/kotlin/me/meeshy/ui/component/presentation/MeeshyCover.kt")).isFalse()
        assertThat(isOutsidePresentation("sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/ViewerDialog.kt")).isTrue()
    }

    @Test
    fun `the number of raw Dialog never goes up`() {
        val found = rawDialogs()
        assertWithMessage(
            "Un Dialog brut a ete ajoute (${found.size} > $RAW_DIALOG_CEILING). Un plein ecran passe par MeeshyCoverDialog " +
                "ou MeeshyCoverHost (montee du bas, sortie jouee avant de rendre la main), jamais relever le plafond. " +
                "Occurrences :\n" + found.joinToString("\n"),
        ).that(found.size).isAtMost(RAW_DIALOG_CEILING)
    }

    @Test
    fun `CoverSheet rises and goes down through the shared cover transitions`() {
        val sheet = mainSources().single { it.name == "SheetDestination.kt" }
        val code = withoutComments(sheet.readText())
        assertThat(code).contains("meeshyCoverEnter(")
        assertThat(code).contains("meeshyCoverExit(")
    }

    private companion object {
        /** Mesuré à 24 le 2026-11-14 (4afe432feb), 23 quand ViewerDialog passe par MeeshyCoverDialog (#18524) ; abaissé par chaque lot qui migre, jamais relevé. */
        const val RAW_DIALOG_CEILING = 23
    }
}
