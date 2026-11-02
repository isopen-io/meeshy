package me.meeshy.sdk.model.reading.summary

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LivingSummaryDeterminismTest {
    private fun input(messages: List<SummarySourceMessage>) =
        LivingSummaryInput(messages, "me", "me", true, UTC, jan(2))

    private val messages = listOf(
        source("m1", "zed", jan(1, 8), content = "Et toi ?", name = "Zed"),
        source("m2", "amy", jan(1, 8, 1), content = "Et toi ?", name = "Amy"),
        source("m3", "kim", jan(1, 8, 2), content = "Et toi ?", name = "Kim"),
        source("m4", "amy", jan(1, 8, 3), content = "Alors ?", name = "Amy"),
    )

    @Test fun `meme entree meme sortie`() {
        assertThat(LivingSummaryAssembly.assemble(input(messages))).isEqualTo(LivingSummaryAssembly.assemble(input(messages)))
    }

    @Test fun `l ordre d entree ne change pas la sortie`() {
        val a = LivingSummaryAssembly.assemble(input(messages))
        val b = LivingSummaryAssembly.assemble(input(messages.reversed()))
        assertThat(b.faceRamp.map { it.id }).isEqualTo(a.faceRamp.map { it.id })
        assertThat(b.digest.topSenders).isEqualTo(a.digest.topSenders)
    }

    @Test fun `egalite de score departagee par nom`() {
        val ramp = LivingSummaryAssembly.assemble(
            input(messages.filter { it.senderId != "amy" }),
        ).faceRamp
        assertThat(ramp.map { it.displayName }).containsExactly("Kim", "Zed").inOrder()
    }
}
