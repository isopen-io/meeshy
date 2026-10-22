package me.meeshy.sdk.waveform

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Miroir de `BoundedFIFOMapTests` (iOS) : l'éviction suit l'ordre d'insertion, jamais de lecture. */
class BoundedFifoMapTest {

    @Test
    fun `depasser la capacite evince la cle la plus ancienne`() {
        val map = BoundedFifoMap<String, Int>(capacity = 2)
        map["a"] = 1
        map["b"] = 2
        map["c"] = 3

        assertThat(map["a"]).isNull()
        assertThat(map["b"]).isEqualTo(2)
        assertThat(map["c"]).isEqualTo(3)
        assertThat(map.size).isEqualTo(2)
    }

    @Test
    fun `mettre a jour une cle existante ne change pas son rang`() {
        val map = BoundedFifoMap<String, Int>(capacity = 2)
        map["a"] = 1
        map["b"] = 2
        map["a"] = 10
        map["c"] = 3

        assertThat(map["a"]).isNull()
        assertThat(map["b"]).isEqualTo(2)
    }

    @Test
    fun `lire une cle ne la sauve pas de l'eviction`() {
        val map = BoundedFifoMap<String, Int>(capacity = 2)
        map["a"] = 1
        map["b"] = 2
        map["a"]
        map["c"] = 3

        assertThat(map["a"]).isNull()
    }

    @Test
    fun `une capacite nulle garde au moins une entree et vider remet a zero`() {
        val map = BoundedFifoMap<String, Int>(capacity = 0)
        map["a"] = 1
        map["b"] = 2

        assertThat(map.size).isEqualTo(1)
        map.clear()
        assertThat(map.size).isEqualTo(0)
    }
}
