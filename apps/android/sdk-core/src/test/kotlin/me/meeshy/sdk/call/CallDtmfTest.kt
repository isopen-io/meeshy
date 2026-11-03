package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallDtmfTest {

    private class FakeLine(override val canInsert: Boolean = true, private val accepts: Boolean = true) : CallDtmfLine {
        val inserted = mutableListOf<Triple<String, Int, Int>>()

        override fun insert(tones: String, durationMs: Int, interToneGapMs: Int): Boolean {
            inserted += Triple(tones, durationMs, interToneGapMs)
            return accepts
        }
    }

    @Test
    fun `les touches d un clavier atteignent l emetteur audio avec la cadence iOS`() {
        val line = FakeLine()
        assertThat(CallDtmf { line }.send("12#")).isTrue()
        assertThat(line.inserted).containsExactly(Triple("12#", 100, 70))
    }

    @Test
    fun `une lettre minuscule est envoyee en majuscule`() {
        val line = FakeLine()
        CallDtmf { line }.send("a")
        assertThat(line.inserted.single().first).isEqualTo("A")
    }

    @Test
    fun `une chaine invalide ne part pas`() {
        val line = FakeLine()
        assertThat(CallDtmf { line }.send("1x")).isFalse()
        assertThat(CallDtmf { line }.send("")).isFalse()
        assertThat(line.inserted).isEmpty()
    }

    @Test
    fun `hors appel ou sans capacite d insertion rien ne part et rien ne plante`() {
        assertThat(CallDtmf { null }.send("1")).isFalse()
        val incapable = FakeLine(canInsert = false)
        assertThat(CallDtmf { incapable }.send("1")).isFalse()
        assertThat(incapable.inserted).isEmpty()
    }

    @Test
    fun `le refus de la ligne est rendu tel quel`() {
        assertThat(CallDtmf { FakeLine(accepts = false) }.send("1")).isFalse()
    }
}
