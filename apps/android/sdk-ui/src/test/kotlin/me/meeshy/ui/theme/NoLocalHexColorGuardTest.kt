package me.meeshy.ui.theme

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Ratchet on local hexadecimal colors (parity program #11570, rule 9: "aucun littéral hexadécimal
 * dans le code d'une feature").
 *
 * A color that a screen writes as a literal escapes the design system, the contrast measures that
 * keep the tokens readable (`MeeshyContrastTest`) and the parity with iOS
 * (`MeeshyTokenParityTest`, `MeeshyIosCssParityTest`). The tokens now cover the iOS vocabulary
 * (`MeeshyPalette`, `MeeshyMessageStateColors`, `MeeshyMediaChromeColors`, `MeeshyAdaptiveColors`),
 * so a NEW literal is never the only way to say a color.
 *
 * ## What is counted
 *
 * Every `Color(0xAARRGGBB)`, `hexColor("#RRGGBB")` and `parseColor("#RRGGBB")` literal of a
 * `src/main` Kotlin file anywhere in `apps/android`, EXCEPT the `me/meeshy/ui/theme` package —
 * that is where the tokens are DEFINED, so that is where a literal belongs. Tests are not scanned.
 * A color computed from data (`Color(0xFF000000L or ink.hex.toLong(16))`) is not a literal and is
 * not counted.
 *
 * ## What the number may do
 *
 * It may only go DOWN. When a lot migrates a literal to a token, it lowers [BASELINE] in the same
 * commit; when a lot adds a literal, this test fails and names every occurrence so the fix is to
 * use a token (or to add the missing token to the theme package), never to raise the baseline.
 */
class NoLocalHexColorGuardTest {

    private val skippedDirectories = setOf("build", ".gradle", ".git", ".idea", "node_modules")

    private val literals = listOf(
        Regex("""\bColor\(\s*0x[0-9A-Fa-f_]{6,8}[uUlL]*\s*[,)]"""),
        Regex("""\bhexColor\(\s*"#?[0-9A-Fa-f]{6}"\s*\)"""),
        Regex("""\bparseColor\(\s*"#[0-9A-Fa-f]{6,8}\b"""),
    )

    /**
     * Gradle's working directory is the MODULE, the IDE's can be the repository. The root of the
     * Android project is the first ancestor that holds both `settings.gradle.kts` and `sdk-ui`;
     * failing loudly beats scanning nothing and passing — the quietest way for a guard to die.
     */
    private fun androidRoot(): File {
        val start = File("").absoluteFile
        val ancestors = generateSequence(start) { it.parentFile }
        val direct = ancestors.firstOrNull { File(it, "settings.gradle.kts").isFile && File(it, "sdk-ui").isDirectory }
        if (direct != null) return direct
        val fromRepository = File(start, "apps/android")
        check(fromRepository.isDirectory) { "racine du projet Android introuvable depuis ${start.absolutePath}" }
        return fromRepository
    }

    private fun mainSources(): List<File> =
        androidRoot().walkTopDown()
            .onEnter { it.name !in skippedDirectories }
            .filter { it.isFile && it.extension == "kt" }
            .filter { "/src/main/" in it.invariantPath() }
            .toList()

    private fun File.invariantPath(): String = path.replace(File.separatorChar, '/')

    private fun isTokenDefinition(file: File): Boolean = "/me/meeshy/ui/theme/" in file.invariantPath()

    private fun literalsIn(lines: List<String>): List<Pair<Int, String>> =
        lines.flatMapIndexed { index, line ->
            literals.flatMap { rule -> rule.findAll(line).map { (index + 1) to it.value }.toList() }
        }

    private fun occurrences(): List<String> =
        mainSources()
            .filterNot(::isTokenDefinition)
            .flatMap { file ->
                literalsIn(file.readLines()).map { (line, text) ->
                    "${file.relativeTo(androidRoot()).invariantPath()}:$line  $text"
                }
            }

    @Test
    fun `the scan sees the sources - otherwise the guard would pass by reading nothing`() {
        assertThat(mainSources().size).isAtLeast(300)
        assertThat(mainSources().filter(::isTokenDefinition).map { it.name })
            .containsAtLeast("MeeshyPalette.kt", "MeeshyThemeTokens.kt")
    }

    @Test
    fun `the rule recognises a literal and ignores a computed color`() {
        val flagged = literalsIn(
            listOf(
                "val a = Color(0xFF123456)",
                "val b = ColorProvider(Color(0x80FFFFFF))",
                "val c = hexColor(\"#FF6B6B\")",
                "val d = android.graphics.Color.parseColor(\"#336699\")",
            ),
        )
        assertThat(flagged.map { it.first }).containsExactly(1, 2, 3, 4).inOrder()

        val ignored = literalsIn(
            listOf(
                "val a = Color(0xFF000000L or ink.hex.toLong(16))",
                "val b = hexColor(accentHex)",
                "val c = flags and 0xFFFFFFFFL",
                "val d = Color(red = 1f, green = 0f, blue = 0f)",
                "val e = MyColor(0xFF123456)",
            ),
        )
        assertThat(ignored).isEmpty()
    }

    @Test
    fun `the number of local hex colors never goes up`() {
        val found = occurrences()
        assertWithMessage(
            "Un litteral hexadecimal de couleur a ete ajoute hors du theme (${found.size} > $BASELINE). " +
                "Utiliser MeeshyPalette / MeeshyMessageStateColors / MeeshyMediaChromeColors / " +
                "MeeshyAdaptiveColors / MeeshyTheme.tokens, ou ajouter le jeton manquant au theme, " +
                "jamais relever BASELINE. Occurrences :\n" + found.joinToString("\n"),
        ).that(found.size).isAtMost(BASELINE)
    }

    private companion object {
        /** Measured on `dev` when the guard landed (2026-10-22). Lower it, never raise it. */
        const val BASELINE = 29
    }
}
