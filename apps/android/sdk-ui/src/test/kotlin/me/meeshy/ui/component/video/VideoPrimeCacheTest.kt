package me.meeshy.ui.component.video

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.ReelPreloadWindow.Tier
import org.junit.Test

class VideoPrimeCacheTest {
    private fun cache(
        network: NetworkCondition,
        policy: AutoDownloadPolicy = AutoDownloadPolicy.WIFI_ONLY,
        fetched: MutableList<String> = mutableListOf(),
        ok: Boolean = true,
    ) = VideoPrimeCache(
        prefetch = { fetched += it; ok },
        videoPolicy = { policy },
        network = { network },
    )

    @Test
    fun `play decode et mount partent meme en cellulaire avec le reglage wifi seul`() = runTest {
        listOf(Tier.PLAY, Tier.DECODE, Tier.MOUNT).forEach { tier ->
            val fetched = mutableListOf<String>()
            val outcome = cache(NetworkCondition.GOOD_CELLULAR, fetched = fetched).prime("u", tier)
            assertThat(outcome).isEqualTo(PrimeOutcome.PRIMED)
            assertThat(fetched).containsExactly("u")
        }
    }

    @Test
    fun `prime et idle sont refuses en cellulaire quand le reglage video l interdit`() = runTest {
        listOf(Tier.PRIME, Tier.IDLE).forEach { tier ->
            val fetched = mutableListOf<String>()
            val outcome = cache(NetworkCondition.GOOD_CELLULAR, fetched = fetched).prime("u", tier)
            assertThat(outcome).isEqualTo(PrimeOutcome.REFUSED_BY_NETWORK)
            assertThat(fetched).isEmpty()
        }
    }

    @Test
    fun `prime et idle partent sur wifi, ou en cellulaire si le reglage l autorise`() = runTest {
        assertThat(cache(NetworkCondition.WIFI).prime("u", Tier.PRIME)).isEqualTo(PrimeOutcome.PRIMED)
        assertThat(cache(NetworkCondition.BAD_CELLULAR, AutoDownloadPolicy.ALWAYS).prime("u", Tier.IDLE))
            .isEqualTo(PrimeOutcome.PRIMED)
    }

    @Test
    fun `hors ligne rien ne part, meme aux paliers immediats`() = runTest {
        val fetched = mutableListOf<String>()
        assertThat(cache(NetworkCondition.OFFLINE, fetched = fetched).prime("u", Tier.PLAY))
            .isEqualTo(PrimeOutcome.REFUSED_BY_NETWORK)
        assertThat(fetched).isEmpty()
    }

    @Test
    fun `un echec de telechargement est rapporte et le lecteur n est prepare qu aux paliers immediats`() = runTest {
        assertThat(cache(NetworkCondition.WIFI, ok = false).prime("u", Tier.PRIME)).isEqualTo(PrimeOutcome.FAILED)
        val c = cache(NetworkCondition.WIFI)
        assertThat(c.preparesPlayer(Tier.DECODE)).isTrue()
        assertThat(c.preparesPlayer(Tier.PRIME)).isFalse()
    }
}
