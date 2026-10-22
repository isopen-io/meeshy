package me.meeshy.sdk.guard

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Garde du budget de taille des sources Kotlin d'`apps/android` (CONVENTIONS.md, règle 13) :
 * plafond dur de 1200 lignes par fichier de production. La logique vit dans UN seul
 * endroit, `scripts/check-file-budget.sh` ; ce test l'exécute pour que la garde tourne
 * dans `testDebugUnitTest` (CI) et dans `meeshy.sh jvm-check` (local) sans toucher
 * au workflow.
 *
 * Le dernier test lit aussi ChatScreen.kt directement : le découpage de l'écran de
 * conversation (#11620) ne doit pas se re-gonfler sous le seuil de découpage.
 */
class FileBudgetGuardTest {

    @get:Rule
    val temp = TemporaryFolder()

    private data class Outcome(val exitCode: Int, val output: String)

    /** Remonte depuis le répertoire de travail (module ou racine) jusqu'à `apps/android`. */
    private fun androidRoot(): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            if (File(dir, "scripts/check-file-budget.sh").isFile && File(dir, "settings.gradle.kts").isFile) {
                return dir
            }
            dir = dir.parentFile
        }
        error("apps/android introuvable depuis ${File("").absolutePath} : la garde ne lirait rien")
    }

    private fun script(): File = File(androidRoot(), "scripts/check-file-budget.sh")

    private fun run(vararg args: String): Outcome {
        val process = ProcessBuilder(listOf("bash", script().path) + args)
            .redirectErrorStream(true)
            .start()
        val output = process.inputStream.bufferedReader().use { it.readText() }
        return Outcome(process.waitFor(), output)
    }

    private fun lines(count: Int): String = (1..count).joinToString(separator = "\n", postfix = "\n") { "val v$it = $it" }

    private fun tree(vararg files: Pair<String, Int>): File {
        val root = temp.newFolder()
        files.forEach { (relative, count) ->
            val file = File(root, relative)
            file.parentFile.mkdirs()
            file.writeText(lines(count))
        }
        return root
    }

    private fun baseline(vararg entries: Pair<String, Int>): File {
        val file = temp.newFile()
        file.writeText("# dette héritée\n" + entries.joinToString("\n") { (path, cap) -> "$path $cap" } + "\n")
        return file
    }

    @Test
    fun `a file exactly at the cap passes`() {
        val root = tree("feature/x/src/main/kotlin/AtCap.kt" to 1200)

        val outcome = run("--root", root.path, "--baseline", baseline().path)

        assertThat(outcome.exitCode).isEqualTo(0)
    }

    @Test
    fun `a file one line over the cap fails and is named`() {
        val root = tree("feature/x/src/main/kotlin/OverCap.kt" to 1201)

        val outcome = run("--root", root.path, "--baseline", baseline().path)

        assertThat(outcome.exitCode).isEqualTo(1)
        assertThat(outcome.output).contains("OverCap.kt")
        assertThat(outcome.output).contains("1201")
    }

    @Test
    fun `an inherited over-cap file passes while it does not grow`() {
        val path = "feature/x/src/main/kotlin/Legacy.kt"
        val root = tree(path to 1500)

        val outcome = run("--root", root.path, "--baseline", baseline(path to 1500).path)

        assertThat(outcome.exitCode).isEqualTo(0)
    }

    @Test
    fun `an inherited over-cap file that grows fails`() {
        val path = "feature/x/src/main/kotlin/Legacy.kt"
        val root = tree(path to 1501)

        val outcome = run("--root", root.path, "--baseline", baseline(path to 1500).path)

        assertThat(outcome.exitCode).isEqualTo(1)
        assertThat(outcome.output).contains("Legacy.kt")
    }

    @Test
    fun `build output and test source sets are outside the budget`() {
        val root = tree(
            "feature/x/build/generated/Big.kt" to 5000,
            "feature/x/src/test/kotlin/BigTest.kt" to 5000,
            "feature/x/src/main/kotlin/Small.kt" to 10,
        )

        val outcome = run("--root", root.path, "--baseline", baseline().path)

        assertThat(outcome.exitCode).isEqualTo(0)
    }

    @Test
    fun `a tree without any source fails instead of passing on nothing`() {
        val root = temp.newFolder()

        val outcome = run("--root", root.path, "--baseline", baseline().path)

        assertThat(outcome.exitCode).isEqualTo(1)
    }

    @Test
    fun `the real android tree respects the budget`() {
        val outcome = run()

        assertThat(outcome.output).doesNotContain("HORS BUDGET")
        assertThat(outcome.output).doesNotContain("GROSSIT")
        assertThat(outcome.exitCode).isEqualTo(0)
    }

    @Test
    fun `the chat screen stays under the split threshold`() {
        val chatScreen = File(
            androidRoot(),
            "feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt",
        )

        assertThat(chatScreen.readLines().size).isAtMost(1000)
    }
}
