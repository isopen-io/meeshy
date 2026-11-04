package me.meeshy.sdk.model.status

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StatusBubblePlacementTest {
    private fun place(
        anchorX: Int,
        anchorY: Int,
        bubbleWidth: Int = 200,
        bubbleHeight: Int = 100,
        windowWidth: Int = 1000,
        windowHeight: Int = 2000,
    ) = StatusBubblePlacement.place(
        anchorX = anchorX,
        anchorY = anchorY,
        bubbleWidth = bubbleWidth,
        bubbleHeight = bubbleHeight,
        windowWidth = windowWidth,
        windowHeight = windowHeight,
        margin = 16,
        gap = 8,
    )

    @Test
    fun `la bulle se centre sur le point touche et se pose juste dessous`() {
        val origin = place(anchorX = 500, anchorY = 300)
        assertThat(origin).isEqualTo(StatusBubbleOrigin(x = 400, y = 308))
    }

    @Test
    fun `contre le bord gauche la bulle reste dans la fenetre`() {
        assertThat(place(anchorX = 20, anchorY = 300).x).isEqualTo(16)
    }

    @Test
    fun `contre le bord droit la bulle reste dans la fenetre`() {
        assertThat(place(anchorX = 990, anchorY = 300).x).isEqualTo(1000 - 200 - 16)
    }

    @Test
    fun `sans place dessous la bulle passe au dessus du point touche`() {
        val origin = place(anchorX = 500, anchorY = 1950)
        assertThat(origin.y).isEqualTo(1950 - 8 - 100)
    }

    @Test
    fun `une bulle plus haute que la fenetre se cale sur la marge haute`() {
        assertThat(place(anchorX = 500, anchorY = 100, bubbleHeight = 3000).y).isEqualTo(16)
    }
}
