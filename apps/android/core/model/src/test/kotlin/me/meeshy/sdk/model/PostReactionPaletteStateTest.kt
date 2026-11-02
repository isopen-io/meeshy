package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostReactionPaletteStateTest {

    @Test
    fun `la palette est fermee au depart`() {
        assertThat(PostReactionPaletteState().isOpen).isFalse()
    }

    @Test
    fun `un appui long ouvre la palette`() {
        assertThat(PostReactionPaletteState().opened().isOpen).isTrue()
    }

    @Test
    fun `fermer au tap exterieur ne choisit rien`() {
        val outcome = PostReactionPaletteState().opened().dismissed()
        assertThat(outcome.isOpen).isFalse()
    }

    @Test
    fun `choisir un emoji ferme la palette et rend l'emoji a envoyer`() {
        val (next, pick) = PostReactionPaletteState().opened().picked("🔥")
        assertThat(next.isOpen).isFalse()
        assertThat(pick).isEqualTo(PostReactionPick.Other("🔥"))
    }

    @Test
    fun `choisir le coeur rend le geste du coeur et non une reaction additive`() {
        val (_, pick) = PostReactionPaletteState().opened().picked(EmojiCatalog.DOUBLE_TAP_EMOJI)
        assertThat(pick).isEqualTo(PostReactionPick.Heart)
    }

    @Test
    fun `un choix sur une palette fermee est ignore`() {
        val (next, pick) = PostReactionPaletteState().picked("🔥")
        assertThat(next.isOpen).isFalse()
        assertThat(pick).isNull()
    }

    @Test
    fun `ouvrir deux fois reste ouvert`() {
        assertThat(PostReactionPaletteState().opened().opened().isOpen).isTrue()
    }

    @Test
    fun `la longue pression dure 450 ms comme sur iOS`() {
        assertThat(PostReactionPaletteState.LONG_PRESS_MILLIS).isEqualTo(450L)
    }
}
