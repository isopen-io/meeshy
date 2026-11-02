package me.meeshy.sdk.model.composer.look

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTextStyle
import org.junit.Test

/** Portage de `ComposerRetouchTextBoardTests.swift` (#12591) : la planche de texte de la retouche. */
class ComposerRetouchTextBoardTest {

    private val empty = ComposerRetouchTextBoard()

    @Test
    fun `montrer l outil sans texte en ouvre un neuf en saisie, aux valeurs du composer`() {
        val board = empty.begin("t1")
        assertThat(board.typingId).isEqualTo("t1")
        val text = board.typing!!
        assertThat(text.fontSize).isEqualTo(96.0)
        assertThat(text.textStyle).isEqualTo("classic")
        assertThat(text.textColor).isEqualTo("#FFFFFF")
        assertThat(text.textAlign).isEqualTo("center")
        assertThat(board.begin("t2").texts).hasSize(1)
    }

    @Test
    fun `une coquille restee vide disparait a la fin de la saisie`() {
        val board = empty.begin("t1").endingTyping()
        assertThat(board.texts).isEmpty()
        assertThat(board.typingId).isNull()
        val kept = empty.begin("t1").writing("t1", "Salut").endingTyping()
        assertThat(kept.texts.single().text).isEqualTo("Salut")
        assertThat(kept.isEmpty).isFalse()
    }

    @Test
    fun `toucher le fond pendant la saisie la termine, hors saisie il pose un texte, jusqu a cinq`() {
        val typing = empty.begin("t1").writing("t1", "a")
        assertThat(typing.tappingBackground("t2").typingId).isNull()
        val five = (2..5).fold(typing.endingTyping()) { board, n -> board.tappingBackground("t$n").writing("t$n", "x").endingTyping() }
        assertThat(five.texts).hasSize(ComposerRetouchTextBoard.CAP)
        assertThat(five.tappingBackground("t6").texts).hasSize(ComposerRetouchTextBoard.CAP)
        assertThat(five.addingText("t6").texts).hasSize(ComposerRetouchTextBoard.CAP)
    }

    @Test
    fun `toucher un texte le rouvre, glisser le deplace sur la scene, pincer et tourner le reglent`() {
        val board = empty.begin("t1").writing("t1", "a").endingTyping()
        assertThat(board.tapping("t1").typingId).isEqualTo("t1")
        assertThat(board.tapping("absent").typingId).isNull()
        val moved = board.moving("t1", dx = 0.7, dy = -0.1).texts.single()
        assertThat(moved.x).isEqualTo(1.0)
        assertThat(moved.y).isWithin(1e-9).of(0.4)
        val turned = board.transforming("t1", zoom = 10.0, degrees = 15.0).texts.single()
        assertThat(turned.scale).isEqualTo(ComposerRetouchTextBoard.MAX_SCALE)
        assertThat(turned.rotation).isEqualTo(15.0)
    }

    @Test
    fun `le style, la couleur et l alignement se posent sur le texte, et l empreinte suit ce qui se voit`() {
        val board = empty.begin("t1").writing("t1", "a")
        val styled = board.styling("t1", StoryTextStyle.NEON).coloring("t1", "#FF3B30").aligning("t1", "left")
        val text = styled.texts.single()
        assertThat(text.textStyle).isEqualTo("neon")
        assertThat(text.textColor).isEqualTo("#FF3B30")
        assertThat(text.textAlign).isEqualTo("left")
        assertThat(styled.fingerprint).isNotEqualTo(board.fingerprint)
        assertThat(board.copy(typingId = null).fingerprint).isEqualTo(board.fingerprint)
        assertThat(ComposerRetouchTextBoard().fingerprint).isEmpty()
    }
}
