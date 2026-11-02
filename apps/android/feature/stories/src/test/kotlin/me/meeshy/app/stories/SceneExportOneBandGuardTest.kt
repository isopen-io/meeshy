package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #13951, recette S8 du compositeur : « ⋯ › Enregistrer » doit montrer LE bandeau de l'export — au-dessus de la barre
 * de navigation, l'issue annoncée, « Réessayer » — et jamais un toast. Un seul hôte porte ce bandeau
 * ([rememberSceneVideoExport]) ; le compositeur, le lecteur de stories et le menu d'un post à scène passent tous par lui.
 * Un chemin qui lirait l'export de son côté réintroduirait un second bandeau, ou un toast : ce témoin le refuse.
 */
class SceneExportOneBandGuardTest {

    private val sources: Map<String, String> by lazy {
        File("src/main/kotlin").walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .associate { it.name to it.readText() }
    }

    private fun callersOf(call: String): Set<String> =
        sources.filter { (name, text) -> name != "$call.kt" && Regex("""\b$call\(""").containsMatchIn(text) }.keys

    @Test
    fun `the composer saves and shares through the one export host`() {
        val composer = sources.getValue("ComposerSceneExportHost.kt")

        assertThat(composer).contains("rememberSceneVideoExport(")
    }

    @Test
    fun `only the export host draws the band and reads the export view model`() {
        assertThat(callersOf("SceneExportBand")).containsExactly("StoryVideoExportHost.kt")
        assertThat(
            sources.filter { (name, text) -> name != "StoryVideoExportViewModel.kt" && "StoryVideoExportViewModel" in text }.keys,
        ).containsExactly("StoryVideoExportHost.kt")
    }

    @Test
    fun `no export path speaks by toast`() {
        val exportPaths = callersOf("rememberSceneVideoExport") + callersOf("rememberStoryVideoExport") + "StoryVideoExportHost.kt"

        assertThat(exportPaths).containsAtLeast("ComposerSceneExportHost.kt", "PostSceneExportMenu.kt", "StoryViewerScreen.kt")
        exportPaths.forEach { name ->
            assertThat(sources.getValue(name)).doesNotContain("Toast.")
        }
    }
}
