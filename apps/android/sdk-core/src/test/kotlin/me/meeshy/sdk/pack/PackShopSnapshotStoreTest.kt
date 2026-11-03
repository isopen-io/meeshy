package me.meeshy.sdk.pack

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.packs.PackShopResponse
import org.junit.Test

class PackShopSnapshotStoreTest {

    private val minute = 60_000L
    private val day = 24 * 60 * minute
    private val policy = PackShopSnapshotStore.POLICY

    @Test fun `a snapshot is fresh for one minute`() {
        assertThat(policy.freshForMillis).isEqualTo(minute)
    }

    @Test fun `a snapshot stays servable stale for seven days`() {
        assertThat(policy.keepForMillis).isEqualTo(7 * day)
        assertThat(policy.keepForMillis).isGreaterThan(policy.freshForMillis)
    }

    @Test fun `the full offered set keeps the original key`() {
        assertThat(PackShopSnapshotStore.key(PackShopResponse.OFFERED)).isEqualTo("offered")
    }

    @Test fun `the key is the set of domains whatever the order or duplicates`() {
        val a = PackShopSnapshotStore.key(listOf(AppearancePackDomain.BANNER, AppearancePackDomain.WALLPAPER))
        val b = PackShopSnapshotStore.key(listOf(AppearancePackDomain.WALLPAPER, AppearancePackDomain.BANNER, AppearancePackDomain.BANNER))

        assertThat(a).isEqualTo(b)
        assertThat(a).isEqualTo("banner,wallpaper")
    }

    @Test fun `distinct domain sets never share a snapshot`() {
        assertThat(PackShopSnapshotStore.key(listOf(AppearancePackDomain.BANNER)))
            .isNotEqualTo(PackShopSnapshotStore.key(PackShopResponse.OFFERED))
    }
}
