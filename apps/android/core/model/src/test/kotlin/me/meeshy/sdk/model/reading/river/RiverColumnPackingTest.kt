package me.meeshy.sdk.model.reading.river

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RiverColumnPackingTest {

    private fun span(start: Int, end: Int) = RiverLaneSpan(start, end, false, emptyList())

    private fun seed(id: String, start: Int, end: Int, viewer: Boolean = false) =
        RiverColumnPacking.Seed(id, viewer, listOf(span(start, end)))

    @Test
    fun `tant que les voix tiennent dans la largeur chacune garde sa colonne a vie`() {
        val lanes = listOf(seed("a", 0, 1, true), seed("b", 5, 6), seed("c", 8, 9))

        val result = RiverColumnPacking.assign(lanes, maxLanes = 3)

        assertThat(result.indexByLaneId).containsExactly("a", 0, "b", 1, "c", 2)
        assertThat(result.overflowed).isFalse()
    }

    @Test
    fun `au dela du maximum les voix aux etendues disjointes partagent une colonne`() {
        val lanes = listOf(seed("a", 0, 1), seed("b", 0, 1), seed("c", 5, 6))

        val result = RiverColumnPacking.assign(lanes, maxLanes = 2)

        assertThat(result.indexByLaneId).containsExactly("a", 0, "b", 1, "c", 0)
        assertThat(result.overflowed).isFalse()
    }

    @Test
    fun `la rive du lecteur est reservee meme si ses etendues sont disjointes des autres`() {
        val lanes = listOf(seed("me", 0, 1, true), seed("b", 5, 6), seed("c", 8, 9))

        val result = RiverColumnPacking.assign(lanes, maxLanes = 2)

        assertThat(result.indexByLaneId["me"]).isEqualTo(0)
        assertThat(result.indexByLaneId["b"]).isEqualTo(1)
        assertThat(result.indexByLaneId["c"]).isEqualTo(1)
        assertThat(result.overflowed).isFalse()
    }

    @Test
    fun `des etendues qui se croisent ne partagent jamais et le debordement est signale`() {
        val lanes = listOf(seed("a", 0, 5), seed("b", 1, 6), seed("c", 2, 7))

        val result = RiverColumnPacking.assign(lanes, maxLanes = 2)

        assertThat(result.overflowed).isTrue()
        assertThat(result.indexByLaneId.keys).containsExactly("a", "b")
    }
}
