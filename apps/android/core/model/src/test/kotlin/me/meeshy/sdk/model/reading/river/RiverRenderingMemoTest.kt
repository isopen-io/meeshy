package me.meeshy.sdk.model.reading.river

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RiverRenderingMemoTest {

    private fun counting(): Pair<RiverRenderingMemo<String, String>, () -> Int> {
        val memo = RiverRenderingMemo<String, String>()
        return memo to { memo.buildCount }
    }

    @Test
    fun `cinquante passes sur la meme empreinte ne construisent qu'une fois`() {
        val (memo, builds) = counting()
        repeat(50) { memo.get("k1") { "rendu" } }
        assertThat(builds()).isEqualTo(1)
    }

    @Test
    fun `une empreinte nouvelle reconstruit le rendu`() {
        val (memo, builds) = counting()
        memo.get("k1") { "a" }
        val next = memo.get("k2") { "b" }
        assertThat(next).isEqualTo("b")
        assertThat(builds()).isEqualTo(2)
    }

    @Test
    fun `revenir a l'empreinte precedente reconstruit, le memo ne garde que la derniere`() {
        val (memo, builds) = counting()
        memo.get("k1") { "a" }
        memo.get("k2") { "b" }
        memo.get("k1") { "a" }
        assertThat(builds()).isEqualTo(3)
    }

    @Test
    fun `le constructeur n'est pas appele quand l'empreinte tient`() {
        val memo = RiverRenderingMemo<Int, String>()
        var calls = 0
        memo.get(1) { calls++; "x" }
        memo.get(1) { calls++; "y" }
        assertThat(calls).isEqualTo(1)
        assertThat(memo.get(1) { "z" }).isEqualTo("x")
    }
}
