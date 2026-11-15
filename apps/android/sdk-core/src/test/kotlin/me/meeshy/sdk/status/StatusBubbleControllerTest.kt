package me.meeshy.sdk.status

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StatusEntry
import org.junit.Test

class StatusBubbleControllerTest {
    private fun entry(id: String = "m1") = StatusEntry(id = id, userId = "u1", username = "ana", moodEmoji = "🎉")

    @Test
    fun `montrer une humeur la rend courante avec son ancre`() {
        val controller = StatusBubbleController()
        controller.show(entry(), StatusBubbleAnchor(120f, 340f))
        assertThat(controller.state.value.entry?.id).isEqualTo("m1")
        assertThat(controller.state.value.anchor).isEqualTo(StatusBubbleAnchor(120f, 340f))
    }

    @Test
    fun `sans ancre explicite la bulle s ancre au dernier point touche`() {
        val controller = StatusBubbleController()
        controller.noteTouch(30f, 60f)
        controller.show(entry())
        assertThat(controller.state.value.anchor).isEqualTo(StatusBubbleAnchor(30f, 60f))
    }

    @Test
    fun `fermer efface l humeur courante`() {
        val controller = StatusBubbleController()
        controller.show(entry())
        controller.dismiss()
        assertThat(controller.state.value.entry).isNull()
    }

    @Test
    fun `un changement de route ferme la bulle`() {
        val controller = StatusBubbleController()
        controller.onNavigationToken("conversations")
        controller.show(entry())
        controller.onNavigationToken("chat/42")
        assertThat(controller.state.value.entry).isNull()
    }

    @Test
    fun `la meme route ou la premiere lecture du jeton ne ferme rien`() {
        val controller = StatusBubbleController()
        controller.show(entry())
        controller.onNavigationToken("conversations")
        assertThat(controller.state.value.entry).isNotNull()
        controller.onNavigationToken("conversations")
        assertThat(controller.state.value.entry).isNotNull()
    }

    @Test
    fun `montrer une seconde humeur remplace la premiere`() {
        val controller = StatusBubbleController()
        controller.show(entry("m1"))
        controller.show(entry("m2"))
        assertThat(controller.state.value.entry?.id).isEqualTo("m2")
    }
}
