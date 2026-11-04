package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

private fun scroll(keyboardOpen: Boolean, dismissed: MutableList<Int> = mutableListOf()) = ThreadChromeScroll().apply {
    this.keyboardOpen = keyboardOpen
    dismissKeyboard = { dismissed += 1 }
}

class KeyboardFirstScrollEffectTest {

    @Test
    fun `vers les anciens clavier leve le clavier se ferme une seule fois`() {
        val dismissed = mutableListOf<Int>()
        val s = scroll(keyboardOpen = true, dismissed)
        s.gestureBegan(position = 1_000)

        s.noteScroll(1_050)
        s.noteScroll(1_200)

        assertThat(dismissed).hasSize(1)
    }

    @Test
    fun `vers les recents le clavier reste`() {
        val dismissed = mutableListOf<Int>()
        val s = scroll(keyboardOpen = true, dismissed)
        s.gestureBegan(position = 1_000)

        s.noteScroll(900)

        assertThat(dismissed).isEmpty()
    }

    @Test
    fun `clavier ferme rien a fermer`() {
        val dismissed = mutableListOf<Int>()
        val s = scroll(keyboardOpen = false, dismissed)
        s.gestureBegan(1_000)
        s.noteScroll(2_000)
        assertThat(dismissed).isEmpty()
    }

    @Test
    fun `un geste commence clavier ouvert ne replie pas le chrome meme une fois le clavier parti`() {
        val s = scroll(keyboardOpen = true)
        s.gestureBegan(1_000)
        s.noteScroll(1_500)

        assertThat(s.keyboardOpen).isFalse()
        assertThat(s.chromeMayCollapse).isFalse()
        assertThat(s.chromeHidden).isFalse()
    }

    @Test
    fun `le geste suivant clavier ferme replie le chrome`() {
        val s = scroll(keyboardOpen = true)
        s.gestureBegan(1_000)
        s.noteScroll(1_500)
        s.gestureEnded()

        s.gestureBegan(1_500)

        assertThat(s.chromeHidden).isTrue()
    }

    @Test
    fun `doigt leve le chrome revient quand la distance restante passe sous 160`() {
        val s = scroll(keyboardOpen = false)
        s.gestureBegan(0)
        s.gestureEnded()
        s.flingStarted(velocityY = 6_000f)
        assertThat(s.chromeHidden).isTrue()

        s.flingConsumed(deltaY = 100_000f)

        assertThat(s.chromeHidden).isFalse()
    }

    @Test
    fun `sans elan le chrome revient des que le doigt se leve`() {
        val s = scroll(keyboardOpen = false)
        s.gestureBegan(0)
        s.gestureEnded()
        s.flingStarted(velocityY = 0f)
        assertThat(s.chromeHidden).isFalse()
    }
}
