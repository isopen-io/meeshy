package me.meeshy.sdk.model.packs

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PackShelfPhaseTest {

    @Test fun `never read paints skeleton rows`() {
        assertThat(PackShelfPhase.of(null, loadFailed = false)).isEqualTo(PackShelfPhase.SKELETON)
    }

    @Test fun `never read and failed paints the error with retry`() {
        assertThat(PackShelfPhase.of(null, loadFailed = true)).isEqualTo(PackShelfPhase.ERROR)
    }

    @Test fun `a known empty domain paints the empty state`() {
        assertThat(PackShelfPhase.of(emptyList(), loadFailed = false)).isEqualTo(PackShelfPhase.EMPTY)
    }

    @Test fun `a known shelf survives a failed refresh`() {
        assertThat(PackShelfPhase.of(listOf(ShopPack(slug = "a")), loadFailed = true)).isEqualTo(PackShelfPhase.CONTENT)
    }
}
