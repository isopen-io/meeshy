package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SharedMapStyleTest {

    @Test
    fun `chaque style se relit depuis sa valeur de stockage`() {
        SharedMapStyle.entries.forEach { style ->
            assertThat(SharedMapStyle.fromStorage(style.storageValue)).isEqualTo(style)
        }
    }

    @Test
    fun `une valeur inconnue d'une version future retombe sur plan`() {
        assertThat(SharedMapStyle.fromStorage("terrain-3d")).isEqualTo(SharedMapStyle.STANDARD)
        assertThat(SharedMapStyle.fromStorage("")).isEqualTo(SharedMapStyle.STANDARD)
        assertThat(SharedMapStyle.fromStorage(null)).isEqualTo(SharedMapStyle.STANDARD)
    }

    @Test
    fun `les valeurs de stockage sont celles d'iOS`() {
        assertThat(SharedMapStyle.entries.map { it.storageValue })
            .containsExactly("standard", "hybrid", "imagery").inOrder()
    }
}
