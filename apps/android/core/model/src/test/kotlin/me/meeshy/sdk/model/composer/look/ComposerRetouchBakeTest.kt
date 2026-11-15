package me.meeshy.sdk.model.composer.look

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.scene.StoryTextBackground
import org.junit.Test

/** Portage de `ComposerRetouchTextRule.bakeRuns` et du fond de la planche (iOS, #12602, #12753) : la vitre d'abord, l'encre ensuite. */
class ComposerRetouchBakeTest {

    private val empty = ComposerRetouchTextBoard()

    private fun text(id: String, z: Int, background: StoryTextBackground = StoryTextBackground.None) =
        StoryTextObject(id = id, text = id, zIndex = z, backgroundStyle = background.toStyleWire())

    @Test
    fun `sans verre une seule passe peint tous les textes dans l ordre du z`() {
        val runs = ComposerRetouchBake.runs(listOf(text("b", 1), text("a", 0)))
        assertThat(runs).hasSize(1)
        assertThat(runs.single().glass).isNull()
        assertThat(runs.single().ink.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `une vitre floute tout ce qui est peint avant elle, puis l encre du verre et des suivants se pose dessus`() {
        val glass = StoryTextBackground.Glass(24.0)
        val runs = ComposerRetouchBake.runs(listOf(text("a", 0), text("g", 1, glass), text("c", 2), text("h", 3, glass)))
        assertThat(runs.map { it.glass?.id }).containsExactly(null, "g", "h").inOrder()
        assertThat(runs.map { run -> run.ink.map { it.id } }).containsExactly(listOf("a"), listOf("g", "c"), listOf("h")).inOrder()
    }

    @Test
    fun `un verre en tete n ouvre pas de passe vide`() {
        val runs = ComposerRetouchBake.runs(listOf(text("g", 0, StoryTextBackground.Glass(24.0))))
        assertThat(runs.map { it.glass?.id }).containsExactly("g")
    }

    @Test
    fun `a z egal l ordre de pose decide`() {
        val runs = ComposerRetouchBake.runs(listOf(text("x", 0), text("y", 0)))
        assertThat(runs.single().ink.map { it.id }).containsExactly("x", "y").inOrder()
    }

    @Test
    fun `le fond d un texte se choisit parmi les douze du composer et change l empreinte`() {
        val board = empty.begin("t1").writing("t1", "Salut")
        assertThat(ComposerRetouchTextBoard.BACKGROUNDS).hasSize(12)
        val glassy = board.backgrounding("t1", StoryTextBackground.Glass(24.0))
        assertThat(glassy.typing!!.backgroundStyle!!.type).isEqualTo("glass")
        assertThat(glassy.fingerprint).isNotEqualTo(board.fingerprint)
        assertThat(glassy.backgrounding("t1", StoryTextBackground.None).typing!!.backgroundStyle).isNull()
    }

    @Test
    fun `toucher le fond avance d un cran dans l ordre des fonds, en boucle`() {
        val board = empty.begin("t1").writing("t1", "a")
        val first = board.cyclingBackground("t1")
        assertThat(StoryTextBackground.resolve(first.typing!!.backgroundStyle, null)).isEqualTo(ComposerRetouchTextBoard.BACKGROUNDS[1])
        val wrapped = (1..12).fold(board) { b, _ -> b.cyclingBackground("t1") }
        assertThat(wrapped.typing!!.backgroundStyle).isNull()
    }
}
