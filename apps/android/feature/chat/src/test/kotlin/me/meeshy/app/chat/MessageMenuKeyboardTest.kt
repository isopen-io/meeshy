package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageMenuKeyboardTest {
    @Test fun `ouvrir un menu ferme le clavier avant de l'ouvrir`() {
        val calls = mutableListOf<String>()
        MessageMenuKeyboard.open("m1", { calls += "dismiss" }, { calls += "open:$it" })
        assertThat(calls).containsExactly("dismiss", "open:m1").inOrder()
    }

    @Test fun `chaque ouverture ferme le clavier une fois, quelle que soit la source`() {
        var dismissals = 0
        repeat(3) { MessageMenuKeyboard.open("m$it", { dismissals++ }, { }) }
        assertThat(dismissals).isEqualTo(3)
    }
}
