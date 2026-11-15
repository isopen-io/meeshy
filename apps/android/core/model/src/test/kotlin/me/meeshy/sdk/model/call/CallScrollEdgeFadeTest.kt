package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallScrollEdgeFadeTest {
    @Test
    fun `a row fades at BOTH of its edges, the same law as iOS ScrollEdgeFadeMask start and end (P2_8, U1_13, U3_3, C1_5, loi 17_9)`() {
        assertThat(CallScrollEdgeFade.edges).isEqualTo(CallScrollEdgeFade.Edges(first = true, last = true))
        assertThat(CallScrollEdgeFade.edges.any).isTrue()
    }

    @Test
    fun `the law never reads the scroll state, so a row that fits whole fades like one that scrolls`() {
        val readers = CallScrollEdgeFade::class.java.declaredMethods.filter { it.name.contains("dges") && it.parameterCount > 0 }
        assertThat(readers).isEmpty()
    }

    @Test
    fun `the edges are physical, so right-to-left and a vertical rail fade the very same two edges`() {
        assertThat(CallScrollEdgeFade.edges.first).isTrue()
        assertThat(CallScrollEdgeFade.edges.last).isTrue()
    }
}
