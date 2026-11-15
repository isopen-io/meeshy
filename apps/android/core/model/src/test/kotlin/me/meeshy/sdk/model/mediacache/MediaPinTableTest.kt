package me.meeshy.sdk.model.mediacache

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaPinTableTest {
    @Test
    fun `une epingle est active jusqu'a son echeance exclue`() {
        val table = MediaPinTable().pin("k", 1_000)
        assertThat(table.isPinned("k", 999)).isTrue()
        assertThat(table.isPinned("k", 1_000)).isFalse()
        assertThat(table.isPinned("absent", 0)).isFalse()
    }

    @Test
    fun `unpin retire et pruned elague les echues`() {
        val table = MediaPinTable().pin("a", 100).pin("b", 500)
        assertThat(table.unpin("a").expiries.keys).containsExactly("b")
        assertThat(table.pruned(100).expiries.keys).containsExactly("b")
        assertThat(table.pruned(500).expiries).isEmpty()
    }

    @Test
    fun `le codec du sidecar fait l'aller-retour et tolere l'illisible`() {
        val table = MediaPinTable().pin("a.jpg", 42).pin("b", 7)
        assertThat(MediaPinTable.decode(table.encode())).isEqualTo(table)
        assertThat(MediaPinTable.decode("{pas du json")).isEqualTo(MediaPinTable())
        assertThat(MediaPinTable.decode(null)).isEqualTo(MediaPinTable())
        assertThat(MediaPinTable.SIDECAR_FILE_NAME).isEqualTo(".pins.json")
    }
}
