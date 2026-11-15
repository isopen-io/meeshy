package me.meeshy.sdk.pack

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.pack.PackDomain
import me.meeshy.sdk.model.packs.PackShopFailure
import me.meeshy.sdk.packs.PackPurchaseOutcome
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CosmeticPackRepositoryTest {
    private lateinit var db: MeeshyDatabase

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun repository(transport: FakePackTransport, online: Boolean = true) =
        CosmeticPackRepository(transport, KeyedJsonCache(db.keyedJsonCacheDao(), FakeClock()), { online })

    @Test
    fun `demander l'etat ou le pack est deja ne part pas sur le reseau`() = runTest {
        val transport = FakePackTransport(catalogue = listOf(FakePackTransport.pack("animes", installed = true)))
        val repository = repository(transport)
        repository.store(PackDomain.WALLPAPER).loadCatalogue()
        transport.calls.clear()

        val outcome = repository.setInstalled(PackDomain.WALLPAPER, "animes", wanted = true)

        assertThat(outcome).isEqualTo(PackToggleOutcome.Done)
        assertThat(transport.calls).isEmpty()
    }

    @Test
    fun `installer puis rejouer la meme demande ne double rien`() = runTest {
        val transport = FakePackTransport(catalogue = listOf(FakePackTransport.pack("animes", count = 4)))
        val repository = repository(transport)
        repository.store(PackDomain.WALLPAPER).loadCatalogue()

        repository.setInstalled(PackDomain.WALLPAPER, "animes", wanted = true)
        repository.setInstalled(PackDomain.WALLPAPER, "animes", wanted = true)

        assertThat(transport.calls.count { it.startsWith("PUT") }).isEqualTo(1)
    }

    @Test
    fun `l'achat confirme met le pack a moi dans l'etagere`() = runTest {
        val transport = FakePackTransport(catalogue = listOf(FakePackTransport.pack("animes")))
        val repository = repository(transport)
        repository.store(PackDomain.WALLPAPER).loadCatalogue()

        val outcome = repository.purchase(PackDomain.WALLPAPER, "animes", "req-1")

        assertThat(outcome).isInstanceOf(PackPurchaseOutcome.Done::class.java)
        assertThat(repository.store(PackDomain.WALLPAPER).state.value.catalogue!!.single().isOwned).isTrue()
    }

    @Test
    fun `un achat refuse arrive en refus structure`() = runTest {
        val transport = FakePackTransport(failWith = FakePackTransport.rejected(409, "INSUFFICIENT_MEESHES"))

        val outcome = repository(transport).purchase(PackDomain.WALLPAPER, "animes", "req-1")

        val refusal = (outcome as PackPurchaseOutcome.Refused).refusal
        assertThat(refusal.failure).isEqualTo(PackShopFailure.INSUFFICIENT_MEESHES)
        assertThat(refusal.definitive).isTrue()
    }

    @Test
    fun `un achat coupe par le reseau reste rejouable`() = runTest {
        val transport = FakePackTransport(failWith = FakePackTransport.offline)

        val outcome = repository(transport).purchase(PackDomain.WALLPAPER, "animes", "req-1")

        assertThat((outcome as PackPurchaseOutcome.Refused).refusal.definitive).isFalse()
    }

    @Test
    fun `les stickers et les cadres de gloire n'ont pas d'achat`() = runTest {
        val outcome = repository(FakePackTransport()).purchase(PackDomain.STICKER, "fruits", "req-1")

        assertThat((outcome as PackPurchaseOutcome.Refused).refusal.definitive).isTrue()
    }
}
