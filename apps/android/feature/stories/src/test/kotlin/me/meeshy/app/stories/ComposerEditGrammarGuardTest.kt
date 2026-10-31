package me.meeshy.app.stories

import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import me.meeshy.sdk.model.composer.edit.ComposerEditTree
import org.junit.Test

/**
 * La garde CUMULATIVE de la grammaire d'édition (spec 2026-10-31, #13973) : une option d'édition n'a que trois places — le
 * rail remplacé, les rails superposés par niveaux, la feuille basse —, jamais un menu qui flotte sur la scène ni une barre
 * à part. Chaque lot y ajoute sa famille ; celle-ci est le FOND : plus de menu de l'appui long, plus de barre au-dessus de
 * Publier, et chaque icône que l'arbre partagé nomme se dessine.
 */
class ComposerEditGrammarGuardTest {

    private val sources: Map<String, String> = File("src/main/kotlin").walkTopDown()
        .filter { it.isFile && it.extension == "kt" }
        .associate { it.name to it.readText() }

    @Test
    fun `the background has no floating menu nor a bar of its own any more`() {
        val forbidden = listOf("ComposerBackgroundMenu", "backgroundMenuOpen", "ComposerSelectionActionBar", "SELECTION_BAR_TAG", "backgroundBar")
        sources.forEach { (name, text) ->
            forbidden.forEach { word -> assertWithMessage("$name cite $word").that(text.contains(word)).isFalse() }
        }
    }

    @Test
    fun `the scene of the composer lays no dropdown over the canvas`() {
        val scene = sources.getValue("StoryComposerStageSlots.kt")
        assertWithMessage("StoryComposerStageSlots.kt ouvre un menu sur la scène").that(scene.contains("DropdownMenu")).isFalse()
    }

    @Test
    fun `every icon the shared tree names is drawn on Android`() {
        ComposerEditTree.shared.levels.flatMap { it.entries }.forEach { entry ->
            assertWithMessage("${entry.id} : ${entry.material}").that(composerEditIcon(entry.material)).isNotNull()
        }
    }

    @Test
    fun `the Edit of the background lays rails, never the sheet of chips, and its settings have left the overflow and the media row`() {
        val rail = sources.getValue("ComposerBackgroundRail.kt")
        assertWithMessage("Fond › Modifier ouvre encore la feuille à pastilles").that(rail.contains("OBJECT_EDIT")).isFalse()
        assertWithMessage("le Cadre est encore une entrée du ⋯").that(sources.getValue("ComposerMoreMenu.kt").contains("MoreEntry.FRAME")).isFalse()
        assertWithMessage("la Boucle est encore dans la rangée des médias").that(sources.getValue("ComposerMediaRows.kt").contains("Loop")).isFalse()
        val framed = sources.filter { (_, text) -> text.contains("ComposerFramePanel(") }.keys
        assertWithMessage("le panneau Cadre n'a qu'un hôte, la bande du Cadrage").that(framed).containsExactly("ComposerSceneFrameUi.kt", "ComposerBackgroundEditRail.kt")
    }
}
