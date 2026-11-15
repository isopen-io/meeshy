package me.meeshy.app.game.photo

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.io.IOException
import java.nio.file.Files
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.game.PhotoStepEmblem
import me.meeshy.sdk.model.game.photo.GamePhotoMoment
import me.meeshy.sdk.model.game.photo.NotebookKeepOutcome
import me.meeshy.sdk.model.game.photo.NotebookRecipe
import me.meeshy.sdk.model.game.photo.NotebookStatus
import me.meeshy.sdk.model.game.photo.PhotoMode
import org.junit.After
import org.junit.Test

/**
 * La Chronique de l'appareil (iOS `GamePhotoNotebook`) : une photo gardée laisse son 9:16, sa source réduite et sa
 * recette ; « plus tard » attend sans fichier ; une reprise remplace sans rien laisser derrière ; un disque plein se
 * nomme et ne laisse ni entrée ni fichier.
 */
class GamePhotoNotebookTest {

    private val root: File = Files.createTempDirectory("notebook").toFile()

    @After fun tearDown() {
        root.deleteRecursively()
    }

    private val moment = GamePhotoMoment("meesh:12", PhotoStepEmblem.Prestige(1))
    private val other = GamePhotoMoment("trophy:spring", PhotoStepEmblem.Start)

    private fun notebook(write: (ByteArray, File) -> Unit = { bytes, file -> file.writeBytes(bytes) }, clock: Long = 10L) =
        GamePhotoNotebook(File(root, "Notebook"), now = { clock }, write = write)

    private fun files(): Set<String> = File(root, "Notebook").list()?.toSet().orEmpty()

    @Test
    fun `une photo gardee laisse son image sa source et sa recette`() = runBlocking<Unit> {
        val book = notebook()

        val outcome = book.keep(moment, KeptPhoto(byteArrayOf(1, 2, 3), PhotoMode.Selfie, byteArrayOf(4, 5), NotebookRecipe("meesh:12", true)))

        assertThat(outcome).isEqualTo(NotebookKeepOutcome.Kept)
        val entry = book.list().single()
        assertThat(entry.status).isEqualTo(NotebookStatus.Kept)
        assertThat(entry.recipe).isEqualTo(NotebookRecipe("meesh:12", true))
        assertThat(book.storyBytes(entry)).isEqualTo(byteArrayOf(1, 2, 3))
        assertThat(files()).containsExactly("index.json", "meesh_12-story.jpg", "meesh_12-source.jpg")
        assertThat(book.occupiedBytes()).isEqualTo(5L)
    }

    @Test
    fun `une carte seule ne garde aucune source`() = runBlocking<Unit> {
        val book = notebook()

        book.keep(moment, KeptPhoto(byteArrayOf(1), PhotoMode.Card))

        assertThat(files()).containsExactly("index.json", "meesh_12-story.jpg")
        assertThat(book.list().single().sourceFile).isNull()
    }

    @Test
    fun `reprendre en carte seule retire l ancienne source`() = runBlocking<Unit> {
        val book = notebook()
        book.keep(moment, KeptPhoto(byteArrayOf(1), PhotoMode.Selfie, byteArrayOf(2)))

        book.keep(moment, KeptPhoto(byteArrayOf(9), PhotoMode.Card))

        assertThat(files()).containsExactly("index.json", "meesh_12-story.jpg")
        assertThat(book.storyBytes(book.list().single())).isEqualTo(byteArrayOf(9))
    }

    @Test
    fun `plus tard attend sans fichier et une photo gardee le remplace`() = runBlocking<Unit> {
        val book = notebook()

        assertThat(book.postpone(other)).isTrue()
        assertThat(book.list().single().status).isEqualTo(NotebookStatus.Pending)
        assertThat(files()).containsExactly("index.json")

        book.keep(other, KeptPhoto(byteArrayOf(1), PhotoMode.Card))
        assertThat(book.list().map { it.status }).containsExactly(NotebookStatus.Kept)
    }

    @Test
    fun `un disque plein se nomme et ne laisse ni entree ni fichier`() = runBlocking<Unit> {
        val book = notebook(write = { _, _ -> throw IOException("write failed: ENOSPC (No space left on device)") })

        val outcome = book.keep(moment, KeptPhoto(byteArrayOf(1), PhotoMode.Selfie, byteArrayOf(2)))

        assertThat(outcome).isEqualTo(NotebookKeepOutcome.NoSpace)
        assertThat(book.list()).isEmpty()
        assertThat(files().filterNot { it == "index.json" }).isEmpty()
    }

    @Test
    fun `un autre refus se dit non gardee`() = runBlocking<Unit> {
        val book = notebook(write = { _, _ -> throw IOException("permission denied") })

        assertThat(book.keep(moment, KeptPhoto(byteArrayOf(1), PhotoMode.Card))).isEqualTo(NotebookKeepOutcome.Unavailable)
    }

    @Test
    fun `une etape de piste ne s ecrit pas en attente`() = runBlocking<Unit> {
        val book = notebook()

        assertThat(book.postpone(moment)).isTrue()

        assertThat(book.list()).isEmpty()
    }

    @Test
    fun `retirer efface l entree et ses images`() = runBlocking<Unit> {
        val book = notebook()
        book.keep(moment, KeptPhoto(byteArrayOf(1), PhotoMode.Selfie, byteArrayOf(2)))
        book.postpone(other)

        assertThat(book.remove("meesh:12")).isTrue()

        assertThat(book.list().map { it.momentId }).containsExactly("trophy:spring")
        assertThat(files()).containsExactly("index.json")
        assertThat(book.occupiedBytes()).isEqualTo(0L)
    }

    @Test
    fun `chaque compte a son dossier`() {
        val files = File("/data/files")
        assertThat(GamePhotoNotebook.folder(files, "u1").path).isEqualTo("/data/files/MeeshyGame/u1/Notebook")
        assertThat(GamePhotoNotebook.folder(files, null).path).isEqualTo("/data/files/MeeshyGame/anonymous/Notebook")
    }
}
