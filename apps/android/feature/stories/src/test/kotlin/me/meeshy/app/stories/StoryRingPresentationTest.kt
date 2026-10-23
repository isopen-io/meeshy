package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PostServedRing
import org.junit.Test

class StoryRingPresentationTest {

    private val equipped = PostServedRing(pack = "p", item = "i")

    @Test
    fun `non lu a l'epaisseur accentuee`() {
        val style = StoryRingStyle.resolve(liveCount = 2, hasUnviewed = true, equipped = null)
        assertThat(style.emphasis).isEqualTo(StoryRingEmphasis.Unread)
        assertThat(style.widthDp).isEqualTo(StoryEntryMetrics.ringWidthAccented.value)
    }

    @Test
    fun `lu est discret`() {
        val style = StoryRingStyle.resolve(liveCount = 2, hasUnviewed = false, equipped = null)
        assertThat(style.emphasis).isEqualTo(StoryRingEmphasis.Read)
        assertThat(style.widthDp).isEqualTo(StoryEntryMetrics.ringWidthQuiet.value)
    }

    @Test
    fun `sans story vivante il n'y a pas d'anneau`() {
        val style = StoryRingStyle.resolve(liveCount = 0, hasUnviewed = true, equipped = null)
        assertThat(style.emphasis).isEqualTo(StoryRingEmphasis.None)
        assertThat(style.widthDp).isEqualTo(0f)
    }

    @Test
    fun `le contour equipe de l'auteur accompagne le style`() {
        assertThat(StoryRingStyle.resolve(1, true, equipped).equipped).isEqualTo(equipped)
        assertThat(StoryRingStyle.resolve(1, false, equipped).equipped).isEqualTo(equipped)
    }
}
