package me.meeshy.sdk.model.composer.edit

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundAction.EDIT
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundAction.PUT_ON_SCENE
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundAction.REMOVE
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundAction.REPLACE
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundSource.CAMERA
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundSource.FILES
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundSource.LIBRARY
import org.junit.Test

/**
 * UNE grammaire d'édition (spec 2026-10-31, #13973) : Android rejoue `packages/shared/design/composer-edit-tree.json`, le
 * fichier qu'iOS décode aussi. Ce témoin DÉCODE le fichier et exige la valeur compilée ; un mot, un ordre ou une icône changé
 * d'un seul côté le rougit. Puis il lit le niveau « Fond » d'un fond média : Modifier · Remplacer · Mettre sur la scène ·
 * Retirer, jamais Dupliquer ni Temps (le fond dure toute la diapo).
 */
class ComposerEditTreeTest {

    private fun sharedFile(): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "packages/shared/design/composer-edit-tree.json")
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        error("composer-edit-tree.json introuvable en remontant depuis ${File("").absolutePath}")
    }

    private val all = ComposerBackgroundLevel.Offers(editor = true, mediaSource = true, camera = true)

    @Test
    fun `the tree of Android is the shared file, field for field`() {
        assertThat(ComposerEditTree.decode(sharedFile().readText())).isEqualTo(ComposerEditTree.shared)
    }

    @Test
    fun `every level a choice opens is a level of the tree`() {
        val ids = ComposerEditTree.shared.levels.map { it.id }
        assertThat(ids).containsNoDuplicates()
        ComposerEditTree.shared.levels.flatMap { it.entries }.mapNotNull { it.next }.forEach { assertThat(ids).contains(it) }
    }

    @Test
    fun `the background of a media scene offers Edit, Replace, Put on the scene and Remove, in that order`() {
        assertThat(ComposerBackgroundLevel.actions(all)).containsExactly(EDIT, REPLACE, PUT_ON_SCENE, REMOVE).inOrder()
        assertThat(ComposerEditTree.shared.level(ComposerEditTree.BACKGROUND_MEDIA)!!.entries.map { it.id })
            .containsNoneOf("duplicate", "time")
    }

    @Test
    fun `only Remove destroys, and it asks first`() {
        val asks = ComposerBackgroundAction.entries.filter { ComposerBackgroundLevel.entryOf(it).opens == ComposerEditTree.Opens.CONFIRMATION }
        val destroys = ComposerBackgroundAction.entries.filter { ComposerBackgroundLevel.entryOf(it).destructive }
        assertThat(asks).containsExactly(REMOVE)
        assertThat(destroys).containsExactly(REMOVE)
    }

    @Test
    fun `Replace opens the sheet of the sources, the others act in place`() {
        val replace = ComposerBackgroundLevel.entryOf(REPLACE)
        assertThat(replace.opens).isEqualTo(ComposerEditTree.Opens.SHEET)
        assertThat(ComposerEditTree.shared.level(replace.next!!)!!.kind).isEqualTo(ComposerEditTree.Kind.SHEET)
        assertThat(ComposerBackgroundLevel.entryOf(PUT_ON_SCENE).opens).isEqualTo(ComposerEditTree.Opens.ACTION)
    }

    @Test
    fun `an action without effect on this surface is not offered`() {
        assertThat(ComposerBackgroundLevel.actions(all.copy(editor = false))).containsExactly(REPLACE, PUT_ON_SCENE, REMOVE).inOrder()
        assertThat(ComposerBackgroundLevel.actions(all.copy(mediaSource = false, camera = false))).containsExactly(EDIT, PUT_ON_SCENE, REMOVE).inOrder()
    }

    @Test
    fun `the sources of Replace are the library, the camera and the files, the camera only where the scene films`() {
        assertThat(ComposerBackgroundLevel.sources(all)).containsExactly(LIBRARY, CAMERA, FILES).inOrder()
        assertThat(ComposerBackgroundLevel.sources(all.copy(camera = false))).containsExactly(LIBRARY, FILES).inOrder()
        assertThat(ComposerBackgroundLevel.sources(all.copy(mediaSource = false))).containsExactly(CAMERA)
    }

    @Test
    fun `every entry names an icon on both platforms and a key of the catalog`() {
        ComposerEditTree.shared.levels.flatMap { it.entries }.forEach { entry ->
            assertThat(entry.sfSymbol).isNotEmpty()
            assertThat(entry.material).isNotEmpty()
            assertThat(entry.label).matches("(composer|story)\\.[A-Za-z.]+")
        }
    }
}
