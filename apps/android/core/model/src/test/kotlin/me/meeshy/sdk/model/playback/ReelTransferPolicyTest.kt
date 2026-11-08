package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.ReelPreloadWindow.Tier
import org.junit.Test

class ReelTransferPolicyTest {
    @Test
    fun `play decode et mount passent sur tout reseau, meme avec le reglage jamais`() {
        listOf(Tier.PLAY, Tier.DECODE, Tier.MOUNT).forEach { tier ->
            AutoDownloadPolicy.values().forEach { policy ->
                val profile = ReelTransferPolicy.profile(tier, policy)
                assertThat(profile.priority).isEqualTo(MediaTransferPriority.IMMEDIATE)
                assertThat(profile.allowsExpensiveNetworkAccess).isTrue()
            }
        }
    }

    @Test
    fun `prime et idle sont differes et refuses en cellulaire si le reglage video l interdit`() {
        listOf(Tier.PRIME, Tier.IDLE).forEach { tier ->
            assertThat(ReelTransferPolicy.profile(tier, AutoDownloadPolicy.WIFI_ONLY).allowsExpensiveNetworkAccess).isFalse()
            assertThat(ReelTransferPolicy.profile(tier, AutoDownloadPolicy.NEVER).allowsExpensiveNetworkAccess).isFalse()
            assertThat(ReelTransferPolicy.profile(tier, AutoDownloadPolicy.ALWAYS).allowsExpensiveNetworkAccess).isTrue()
            assertThat(ReelTransferPolicy.profile(tier, AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR).allowsExpensiveNetworkAccess)
                .isTrue()
            assertThat(ReelTransferPolicy.priority(tier)).isEqualTo(MediaTransferPriority.DEFERRABLE)
        }
    }
}
