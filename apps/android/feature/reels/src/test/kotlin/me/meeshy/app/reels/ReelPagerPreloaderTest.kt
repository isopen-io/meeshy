package me.meeshy.app.reels

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.ReelPreloadWindow
import me.meeshy.sdk.model.ReelPreloadWindow.Tier
import me.meeshy.sdk.model.media.DeviceMediaTier
import org.junit.Test

class ReelPagerPreloaderTest {

    private class FakePool : ReelPreparationPool {
        val prepared = mutableListOf<ReelPreparation>()
        val retired = mutableListOf<String>()
        override fun prepare(preparation: ReelPreparation) {
            prepared += preparation
        }
        override fun retire(reelId: String) {
            retired += reelId
        }
    }

    private fun targets(count: Int) = List(count) { ReelPrepTarget("r$it", "https://v/$it.mp4", "https://p/$it.jpg", listOf("https://a/$it.m4a")) }

    private fun inputs(
        dataSaver: Boolean = false,
        condition: NetworkCondition = NetworkCondition.WIFI,
    ) = ReelPreloadInputs(
        dataSaverEnabled = dataSaver, powerSaveMode = false, thermalStatus = 0, isLowRamDevice = false,
        totalMemBytes = 8L * 1_073_741_824L, memoryClassMb = 256, condition = condition, tier = DeviceMediaTier.HIGH,
    )

    private fun preloader(pool: FakePool, inputs: ReelPreloadInputs = inputs()) =
        ReelPagerPreloader(pool) { visits -> ReelPreloadConstraints.context(inputs, visits) }

    @Test
    fun `entrer prepare le suivant ET le precedent avec lecteur, poster et son`() {
        val pool = FakePool()
        preloader(pool).enter(index = 5, targets = targets(10), nowMs = 0)

        val decode = pool.prepared.filter { it.tier == Tier.DECODE }.map { it.target.id }
        assertThat(decode).containsExactly("r6", "r4")
        assertThat(pool.prepared.filter { it.tier == Tier.DECODE }.all { it.preroll && it.prefetchesAudio }).isTrue()
    }

    @Test
    fun `le palier monte charge le son sans preparer de lecteur et le palier amorce ni l'un ni l'autre`() {
        val pool = FakePool()
        val loose = ReelPagerPreloader(pool) { visits ->
            ReelPreloadConstraints.context(inputs(), listOf(ReelPreloadWindow.Visit(500, ReelPreloadWindow.VisitDirection.FORWARD)) + visits)
        }
        loose.enter(index = 5, targets = targets(20), nowMs = 0)

        val mount = pool.prepared.first { it.tier == Tier.MOUNT }
        assertThat(mount.preroll).isFalse()
        assertThat(mount.prefetchesAudio).isTrue()
        val prime = pool.prepared.first { it.tier == Tier.PRIME }
        assertThat(prime.preroll).isFalse()
        assertThat(prime.prefetchesAudio).isFalse()
    }

    @Test
    fun `la fenetre plancher est N moins 2 a N plus 2 sans historique`() {
        val pool = FakePool()
        preloader(pool).enter(index = 5, targets = targets(20), nowMs = 0)

        assertThat(pool.prepared.map { it.target.id }).containsExactly("r6", "r4", "r7", "r3")
    }

    @Test
    fun `avancer retire ce qui sort de la fenetre et re-etage ce qui reste`() {
        val pool = FakePool()
        val preloader = preloader(pool)
        preloader.enter(5, targets(20), nowMs = 0)
        pool.prepared.clear()

        preloader.enter(6, targets(20), nowMs = 12_000)

        assertThat(pool.retired).containsExactly("r6", "r3")
        assertThat(pool.prepared.map { it.target.id }).containsExactly("r7", "r5", "r8", "r4")
        assertThat(pool.prepared.first { it.target.id == "r5" }.tier).isEqualTo(Tier.DECODE)
        assertThat(pool.prepared.first { it.target.id == "r4" }.tier).isEqualTo(Tier.MOUNT)
    }

    @Test
    fun `releaseAll retire tout ce qui est vivant`() {
        val pool = FakePool()
        val preloader = preloader(pool)
        preloader.enter(5, targets(20), nowMs = 0)

        preloader.releaseAll()

        assertThat(pool.retired).containsExactly("r6", "r4", "r7", "r3")
    }

    @Test
    fun `retire d'un reel inconnu ne touche pas le pool`() {
        val pool = FakePool()
        preloader(pool).retire("absent")
        assertThat(pool.retired).isEmpty()
    }

    @Test
    fun `aux bornes du fil seuls les voisins existants sont prepares`() {
        val pool = FakePool()
        preloader(pool).enter(0, targets(2), nowMs = 0)
        assertThat(pool.prepared.map { it.target.id }).containsExactly("r1")
    }

    @Test
    fun `data saver garde le plancher meme avec un balayage rapide`() {
        val pool = FakePool()
        val saver = ReelPagerPreloader(pool) { _ ->
            ReelPreloadConstraints.context(
                inputs(dataSaver = true),
                List(6) { ReelPreloadWindow.Visit(400, ReelPreloadWindow.VisitDirection.FORWARD) },
            )
        }
        saver.enter(5, targets(30), nowMs = 0)
        assertThat(pool.prepared.map { it.target.id }.toSet()).containsExactly("r6", "r4", "r7", "r3")
    }
}
