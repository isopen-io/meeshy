package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Pure resolution of a [NetworkCondition] from connectivity flags (feature-parity §L —
 * port of iOS `NetworkConditionMonitor.resolveFromFlags`). Kept pure and flag-driven so
 * it is fully testable without an Android `ConnectivityManager`; the live monitor (which
 * maps `NetworkCapabilities` onto these booleans) is a thin glue layer over this SSOT.
 */
class NetworkConditionResolverTest {

    @Test
    fun unsatisfiedLink_isOffline_regardlessOfTransport() {
        assertThat(
            NetworkConditionResolver.resolveFromFlags(
                isSatisfied = false, isConstrained = false, usesWifi = true, usesCellular = false,
            ),
        ).isEqualTo(NetworkCondition.OFFLINE)
        assertThat(
            NetworkConditionResolver.resolveFromFlags(
                isSatisfied = false, isConstrained = true, usesWifi = false, usesCellular = true,
            ),
        ).isEqualTo(NetworkCondition.OFFLINE)
    }

    @Test
    fun unconstrainedWifi_isWifi() {
        assertThat(
            NetworkConditionResolver.resolveFromFlags(
                isSatisfied = true, isConstrained = false, usesWifi = true, usesCellular = false,
            ),
        ).isEqualTo(NetworkCondition.WIFI)
    }

    @Test
    fun constrainedWifi_withNoCellular_degradesToBadCellular() {
        assertThat(
            NetworkConditionResolver.resolveFromFlags(
                isSatisfied = true, isConstrained = true, usesWifi = true, usesCellular = false,
            ),
        ).isEqualTo(NetworkCondition.BAD_CELLULAR)
    }

    @Test
    fun unconstrainedCellular_isGoodCellular() {
        assertThat(
            NetworkConditionResolver.resolveFromFlags(
                isSatisfied = true, isConstrained = false, usesWifi = false, usesCellular = true,
            ),
        ).isEqualTo(NetworkCondition.GOOD_CELLULAR)
    }

    @Test
    fun constrainedCellular_isBadCellular() {
        assertThat(
            NetworkConditionResolver.resolveFromFlags(
                isSatisfied = true, isConstrained = true, usesWifi = false, usesCellular = true,
            ),
        ).isEqualTo(NetworkCondition.BAD_CELLULAR)
    }

    @Test
    fun wifiAndCellularTogether_unconstrained_prefersWifi() {
        assertThat(
            NetworkConditionResolver.resolveFromFlags(
                isSatisfied = true, isConstrained = false, usesWifi = true, usesCellular = true,
            ),
        ).isEqualTo(NetworkCondition.WIFI)
    }

    @Test
    fun wifiAndCellularTogether_constrained_isBadCellular() {
        assertThat(
            NetworkConditionResolver.resolveFromFlags(
                isSatisfied = true, isConstrained = true, usesWifi = true, usesCellular = true,
            ),
        ).isEqualTo(NetworkCondition.BAD_CELLULAR)
    }

    @Test
    fun wiredLink_noWifiNoCellular_unconstrained_isTreatedAsWifi() {
        assertThat(
            NetworkConditionResolver.resolveFromFlags(
                isSatisfied = true, isConstrained = false, usesWifi = false, usesCellular = false,
            ),
        ).isEqualTo(NetworkCondition.WIFI)
    }

    @Test
    fun otherLink_noWifiNoCellular_constrained_isBadCellular() {
        assertThat(
            NetworkConditionResolver.resolveFromFlags(
                isSatisfied = true, isConstrained = true, usesWifi = false, usesCellular = false,
            ),
        ).isEqualTo(NetworkCondition.BAD_CELLULAR)
    }
}
