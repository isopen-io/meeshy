package me.meeshy.sdk.model.mood

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.mood.StatusAnchor.Plan
import org.junit.Test

class StatusAnchorTest {
    @Test
    fun `sans commentaire c est un repost simple`() {
        assertThat(StatusAnchor.plan(null)).isEqualTo(Plan.SimpleRepost)
        assertThat(StatusAnchor.plan("  \n")).isEqualTo(Plan.SimpleRepost)
    }

    @Test
    fun `la phrase de la source renvoyee telle quelle n est pas un commentaire`() {
        assertThat(StatusAnchor.plan("Bien dormi ", prefill = "Bien dormi")).isEqualTo(Plan.SimpleRepost)
    }

    @Test
    fun `un commentaire ajoute fait une citation ebarbee`() {
        assertThat(StatusAnchor.plan("  Pareil ", prefill = "Bien dormi")).isEqualTo(Plan.Quote("Pareil"))
    }
}
