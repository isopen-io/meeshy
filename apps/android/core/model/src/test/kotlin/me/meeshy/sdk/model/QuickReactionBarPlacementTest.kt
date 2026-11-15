package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class QuickReactionBarPlacementTest {
    private val defaults = (1..20).map { "d$it" }

    @Test fun `quinze emojis, les recents d abord sans doublon`() {
        val list = QuickReactionBarPlacement.emojis(recents = listOf("x", "y", "x", " "), defaults = defaults)
        assertThat(list).hasSize(15)
        assertThat(list.take(3)).containsExactly("x", "y", "d1").inOrder()
    }

    @Test fun `moins de quinze disponibles rend tout ce qui existe`() {
        assertThat(QuickReactionBarPlacement.emojis(listOf("a"), listOf("b"))).containsExactly("a", "b").inOrder()
    }

    @Test fun `le plus n apparait qu apres trois cent cinquante millisecondes`() {
        assertThat(QuickReactionBarPlacement.plusVisible(349)).isFalse()
        assertThat(QuickReactionBarPlacement.plusVisible(350)).isTrue()
    }

    @Test fun `la barre se pose sous la bulle quand cela tient`() {
        val p = QuickReactionBarPlacement.place(bubbleTop = 100f, bubbleBottom = 200f, barHeight = 52f, safeTop = 0f, safeBottom = 800f)
        assertThat(p.side).isEqualTo(QuickReactionBarPlacement.Side.BELOW)
        assertThat(p.top).isEqualTo(208f)
    }

    @Test fun `sans place dessous la barre passe au dessus sans sortir de la zone sure`() {
        val p = QuickReactionBarPlacement.place(bubbleTop = 600f, bubbleBottom = 780f, barHeight = 52f, safeTop = 40f, safeBottom = 800f)
        assertThat(p.side).isEqualTo(QuickReactionBarPlacement.Side.ABOVE)
        assertThat(p.top).isEqualTo(540f)
    }

    @Test fun `une bulle haute et basse reste dans la zone sure`() {
        val p = QuickReactionBarPlacement.place(bubbleTop = 20f, bubbleBottom = 790f, barHeight = 52f, safeTop = 40f, safeBottom = 800f)
        assertThat(p.top).isAtLeast(40f)
        assertThat(p.top + 52f).isAtMost(800f)
    }
}
