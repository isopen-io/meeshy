package me.meeshy.app.reels

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ReelContentTap
import org.junit.Test

class ReelChromeHolderTest {
    @Test
    fun `le premier toucher en immersif rend le chrome sans basculer la lecture`() {
        val holder = ReelChromeHolder()
        holder.setHidden(true)

        assertThat(holder.onContentTap(hasPlayableMedia = true)).isEqualTo(ReelContentTap.Outcome.RESTORE_CHROME)
        assertThat(holder.hidden).isFalse()
        assertThat(holder.onContentTap(hasPlayableMedia = true)).isEqualTo(ReelContentTap.Outcome.TOGGLE_PLAYBACK)
    }

    @Test
    fun `changer de page reinitialise le mode immersif`() {
        val holder = ReelChromeHolder()
        holder.setHidden(true)

        holder.onPageChanged()

        assertThat(holder.hidden).isFalse()
    }
}
