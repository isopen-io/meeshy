package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import org.junit.Test

class ThreadRowMuxTest {

    @Test
    fun `Script, le mode par defaut drapeau allume, se rend en rangees plates`() {
        assertThat(ThreadRowMux.rendering(ConversationReadingMode.SCRIPT)).isEqualTo(ThreadRowRendering.Flat)
    }

    @Test
    fun `Focal partage la rangee plate de Script`() {
        assertThat(ThreadRowMux.rendering(ConversationReadingMode.FOCAL)).isEqualTo(ThreadRowRendering.Flat)
    }

    @Test
    fun `Bulles, le mode drapeau eteint, garde la bulle`() {
        assertThat(ThreadRowMux.rendering(ConversationReadingMode.BUBBLES)).isEqualTo(ThreadRowRendering.Bubble)
    }

    @Test
    fun `Resume et Riviere gardent la bulle sous leur surcouche`() {
        assertThat(ThreadRowMux.rendering(ConversationReadingMode.SUMMARY)).isEqualTo(ThreadRowRendering.Bubble)
        assertThat(ThreadRowMux.rendering(ConversationReadingMode.RIVER)).isEqualTo(ThreadRowRendering.Bubble)
    }

    @Test
    fun `sans mode connu le rendu historique de bulle tient`() {
        assertThat(ThreadRowMux.rendering(null)).isEqualTo(ThreadRowRendering.Bubble)
    }
}
