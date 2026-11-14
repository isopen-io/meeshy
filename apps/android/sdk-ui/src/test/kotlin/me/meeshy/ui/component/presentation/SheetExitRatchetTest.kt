package me.meeshy.ui.component.presentation

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Cliquet des sorties coupées (#18416).
 *
 * (a) Un `ModalBottomSheet(` brut, monté par `if (x)` ou `x?.let`, disparaît d'un coup quand l'hôte le retire : il
 * n'a ni `hide()` ni hôte qui attende sa descente. [MeeshyModalSheet] et [MeeshySheetPresence] le font ; seule
 * `SheetDestination.kt` (PageSheet, qui a sa propre descente) garde la feuille brute.
 *
 * (b) Un `AnimatedVisibility(visible = x != null)` lit `x` vivant dans son contenu : la sortie tourne sur un contenu
 * vide. `MeeshyAnimatedVisibility` tient la dernière valeur. Limite assumée : un hôte qui tient déjà la valeur à la main
 * (FeedbackToastCenterHost, ScrollTimePill) reste compté jusqu'à sa migration.
 *
 * Les deux nombres ne font que DESCENDRE : un lot qui migre abaisse le plafond dans le même commit ; un ajout fait
 * rougir ce test et nomme chaque occurrence.
 */
class SheetExitRatchetTest {

    private val skippedDirectories = setOf("build", ".gradle", ".git", ".idea", "node_modules")
    private val rawSheet = Regex("""(?<![\w.])ModalBottomSheet\(""")
    private val animatedVisibility = Regex("""\bAnimatedVisibility\(""")
    private val sheetHomes = setOf("MeeshyModalSheet.kt", "SheetDestination.kt")

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

    private fun firstArgument(rest: String): String {
        var depth = 0
        val end = rest.indexOfFirst { char ->
            when {
                char in "([{" -> { depth++; false }
                char in ")]}" -> if (depth == 0) true else { depth--; false }
                else -> char == ',' && depth == 0
            }
        }
        return if (end < 0) rest else rest.substring(0, end)
    }

    internal fun rawSheetsIn(source: String): Int = rawSheet.findAll(withoutComments(source)).count()

    internal fun nullDrivenVisibilitiesIn(source: String): Int {
        val code = withoutComments(source)
        return animatedVisibility.findAll(code).count { match ->
            val argument = firstArgument(code.substring(match.range.last + 1))
            Regex("""^\s*visible\s*=""").containsMatchIn(argument) && "!= null" in argument
        }
    }

    private fun occurrences(count: (String) -> Int, skip: (File) -> Boolean = { false }): List<String> =
        mainSources().filterNot(skip).flatMap { file ->
            List(count(file.readText())) { file.relativeTo(androidRoot()).invariantPath() }
        }

    @Test
    fun `the scan sees the sources - otherwise the guard would pass by reading nothing`() {
        val names = mainSources().map { it.name }
        assertThat(names.size).isAtLeast(300)
        assertThat(names).containsAtLeast("SheetDestination.kt", "MeeshyModalSheet.kt")
    }

    @Test
    fun `the rules recognise a raw sheet and a null-driven visibility, and nothing else`() {
        assertThat(rawSheetsIn("if (open) ModalBottomSheet(onDismissRequest = {}) {}")).isEqualTo(1)
        assertThat(rawSheetsIn("MeeshyModalSheet(onDismissRequest = {}) {}")).isEqualTo(0)
        assertThat(rawSheetsIn("material3.ModalBottomSheet(x)")).isEqualTo(0)
        assertThat(rawSheetsIn("// ModalBottomSheet(\n/* ModalBottomSheet( */")).isEqualTo(0)

        assertThat(nullDrivenVisibilitiesIn("AnimatedVisibility(visible = panel != null, enter = e) {}")).isEqualTo(1)
        assertThat(nullDrivenVisibilitiesIn("AnimatedVisibility(\n  visible = isVisible() && current != null,\n) {}")).isEqualTo(1)
        assertThat(nullDrivenVisibilitiesIn("AnimatedVisibility(visible = open, modifier = m.then(x != null)) {}")).isEqualTo(0)
        assertThat(nullDrivenVisibilitiesIn("AnimatedVisibility(visibleState = state) {}")).isEqualTo(0)
        assertThat(nullDrivenVisibilitiesIn("MeeshyAnimatedVisibility(value = x != null) {}")).isEqualTo(0)
    }

    @Test
    fun `the number of raw Material sheets never goes up`() {
        val found = occurrences(::rawSheetsIn) { it.name in sheetHomes }
        assertWithMessage(
            "Un ModalBottomSheet brut a ete ajoute (${found.size} > $RAW_SHEET_CEILING). Utiliser MeeshyModalSheet " +
                "(dismiss() joue hide() avant de fermer) et MeeshySheetPresence chez l'hote, jamais relever le plafond. " +
                "Occurrences :\n" + found.joinToString("\n"),
        ).that(found.size).isAtMost(RAW_SHEET_CEILING)
    }

    @Test
    fun `the number of null-driven AnimatedVisibility never goes up`() {
        val found = occurrences(::nullDrivenVisibilitiesIn)
        assertWithMessage(
            "Un AnimatedVisibility(visible = x != null) a ete ajoute (${found.size} > $NULL_VISIBILITY_CEILING). " +
                "Utiliser MeeshyAnimatedVisibility(value = x), qui peint la derniere valeur pendant la sortie, jamais " +
                "relever le plafond. Occurrences :\n" + found.joinToString("\n"),
        ).that(found.size).isAtMost(NULL_VISIBILITY_CEILING)
    }

    private companion object {
        /** Mesuré à 73 le 2026-11-14 ; abaissé par chaque lot qui migre, jamais relevé. */
        const val RAW_SHEET_CEILING = 73

        /** Mesuré à 24 le 2026-11-14 ; abaissé par chaque lot qui migre, jamais relevé. */
        const val NULL_VISIBILITY_CEILING = 24
    }
}
