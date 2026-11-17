package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/** Épure 2/3 de la liste (#17697) : la recherche globale vierge tient en UNE ligne, le champ au-dessus dit déjà « chercher ». */
class EpureListeLot2StringsTest {

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val moduleRoot: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .first { File(it, "feature/conversations/src/main/res").isDirectory }

    private val resDir = File(moduleRoot, "feature/conversations/src/main/res")
    private val pattern = Regex("""<string name="([^"]+)"[^>]*>""")

    private fun names(folder: String): Set<String> =
        File(resDir, folder).listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { f -> pattern.findAll(f.readText()).map { it.groupValues[1] }.toList() }.toSet()

    @Test
    fun `the initial global search says one line and no title`() {
        val screen = File(moduleRoot, "feature/conversations/src/main/kotlin/me/meeshy/app/conversations/GlobalSearchScreen.kt").readText()
        assertThat(screen).doesNotContain("global_search_empty_title")
        assertThat(screen).doesNotContain("sublabel = stringResource(R.string.global_search_empty_subtitle)")
        assertThat(screen).contains("label = stringResource(R.string.global_search_empty_subtitle)")
    }

    @Test
    fun `the search title leaves the seven folders and the manifest`() {
        folders.forEach { assertWithMessage(it).that(names(it)).doesNotContain("global_search_empty_title") }
        val manifest = File(moduleRoot, "i18n/manifest").walkTopDown().filter { it.extension == "json" }.joinToString("\n") { it.readText() }
        assertThat(manifest).doesNotContain("\"androidName\": \"global_search_empty_title\"")
    }
}
