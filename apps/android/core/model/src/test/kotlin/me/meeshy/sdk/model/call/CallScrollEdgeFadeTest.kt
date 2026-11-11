package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallScrollEdgeFadeTest {
    private fun edges(back: Boolean, ahead: Boolean, horizontal: Boolean = true, rtl: Boolean = false, symmetric: Boolean = true) =
        CallScrollEdgeFade.edges(back, ahead, horizontal, rtl, symmetric)

    @Test
    fun `a row that fits whole is cut nowhere, so nothing fades`() {
        assertThat(edges(back = false, ahead = false).any).isFalse()
        assertThat(edges(back = false, ahead = false, symmetric = false).any).isFalse()
    }

    @Test
    fun `a row that scrolls fades at BOTH edges, at rest on its first chip too (P12_8, P14_9)`() {
        assertThat(edges(back = false, ahead = true)).isEqualTo(CallScrollEdgeFade.Edges(first = true, last = true))
        assertThat(edges(back = true, ahead = false)).isEqualTo(CallScrollEdgeFade.Edges(first = true, last = true))
        assertThat(edges(back = true, ahead = true)).isEqualTo(CallScrollEdgeFade.Edges(first = true, last = true))
    }

    @Test
    fun `the symmetric fade is the same in right-to-left`() {
        assertThat(edges(back = false, ahead = true, rtl = true)).isEqualTo(edges(back = false, ahead = true, rtl = false))
    }

    @Test
    fun `a rail fades only the edge that hides buttons, and lets go once that edge is reached`() {
        assertThat(edges(back = false, ahead = true, horizontal = false, symmetric = false))
            .isEqualTo(CallScrollEdgeFade.Edges(first = false, last = true))
        assertThat(edges(back = true, ahead = false, horizontal = false, symmetric = false))
            .isEqualTo(CallScrollEdgeFade.Edges(first = true, last = false))
    }

    @Test
    fun `in right-to-left the horizontal start is the RIGHT edge, so what hides behind it fades there`() {
        assertThat(edges(back = true, ahead = false, rtl = true, symmetric = false))
            .isEqualTo(CallScrollEdgeFade.Edges(first = false, last = true))
        assertThat(edges(back = true, ahead = false, rtl = false, symmetric = false))
            .isEqualTo(CallScrollEdgeFade.Edges(first = true, last = false))
    }

    @Test
    fun `right-to-left never flips a vertical rail`() {
        assertThat(edges(back = false, ahead = true, horizontal = false, rtl = true, symmetric = false))
            .isEqualTo(CallScrollEdgeFade.Edges(first = false, last = true))
    }
}
