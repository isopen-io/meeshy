package me.meeshy.ui.format

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Garde anti-duplication de l'abrégé des comptes (parité #11570, lot formats-localises) :
 * `CompactCountFormat` (`:core:model`) est le point UNIQUE. Une copie locale — `formatCompactCount`,
 * `compact`, ou un « %.1fk » gravé — rouvrirait le défaut de locale (« 1.5k » en français).
 */
class NoLocalCompactCountGuardTest {

    private val skipped = setOf("build", ".gradle", ".git", ".idea", "node_modules")

    private val duplicates = listOf(
        Regex("""\bfun\s+(?:[\w.]+\.)?(?:formatCompactCount|compactCount|formatCompact|abbreviateCount)\s*\("""),
        Regex("""["']%\.\d[fF][kKmMbB]["']"""),
        Regex("""\.toString\(\)\s*\+\s*["'][kKmM]["']"""),
    )

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
            .onEnter { it.name !in skipped }
            .filter { it.isFile && it.extension == "kt" && "/src/main/" in it.path.replace(File.separatorChar, '/') }
            .toList()

    private fun matches(lines: List<String>): List<Pair<Int, String>> =
        lines.flatMapIndexed { index, line ->
            duplicates.flatMap { rule -> rule.findAll(line).map { (index + 1) to it.value }.toList() }
        }

    @Test
    fun `the scan sees the sources`() {
        assertThat(mainSources().size).isAtLeast(300)
    }

    @Test
    fun `the rule recognises a local copy`() {
        assertThat(matches(listOf("fun formatCompactCount(count: Int): String {", "val s = \"%.1fk\".format(x)"))).hasSize(2)
        assertThat(matches(listOf("CompactCountFormat.text(count, locale)"))).isEmpty()
    }

    @Test
    fun `no module rewrites the compact count`() {
        val found = mainSources().flatMap { file ->
            matches(file.readLines()).map { (line, text) -> "${file.relativeTo(androidRoot()).path}:$line  $text" }
        }
        assertWithMessage("Une copie locale de l'abrege des comptes a ete ajoutee. Utiliser CompactCountFormat :\n" + found.joinToString("\n"))
            .that(found).isEmpty()
    }
}
