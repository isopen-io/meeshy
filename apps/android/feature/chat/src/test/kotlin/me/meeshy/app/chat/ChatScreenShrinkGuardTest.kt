package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/** Garde de budget : ChatScreen.kt ne regrossit pas, la branche bulle vit dans [BubbleThreadRow]. */
class ChatScreenShrinkGuardTest {

    private fun source(name: String): File =
        generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "src/main/kotlin/me/meeshy/app/chat/$name") }
            .firstOrNull { it.exists() }
            ?: File("src/main/kotlin/me/meeshy/app/chat/$name")

    @Test
    fun `ChatScreen reste sous le budget de 2700 lignes`() {
        assertThat(source("ChatScreen.kt").readLines().size).isAtMost(2700)
    }

    @Test
    fun `la rangee de message ne dessine plus la bulle elle-meme`() {
        assertThat(source("ChatMessageRow.kt").readText()).doesNotContain("MessageBubble(")
        assertThat(source("BubbleThreadRow.kt").readText()).contains("MessageBubble(")
    }
}
