package me.meeshy.sdk.packs

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.packs.PackInstallationUpdatedEvent
import me.meeshy.sdk.model.packs.PackShopResponse
import me.meeshy.sdk.model.packs.PackShopSection
import me.meeshy.sdk.model.packs.ShopPack
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.PackApi
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.socket.ArrivalLedger
import me.meeshy.sdk.socket.ArrivalStamp
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.SocketInboundRoute
import me.meeshy.sdk.socket.exposed
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * `pack:installation-updated` s'écrit sous le compte auquel il est ARRIVÉ : un événement de A qui attend encore son
 * collecteur quand B se connecte ne marque rien comme possédé dans la vitrine de B.
 */
@RunWith(RobolectricTestRunner::class)
class PackInstallationSocketBindingTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock()
    private val owner = Owner("A")
    private val transition = SessionTransitionFlags()
    private val fence = AccountFence(owner, transition)
    private val api = mockk<PackApi>()
    private val io = Executors.newSingleThreadExecutor()

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() {
        io.shutdownNow()
        db.close()
    }

    private val shop = PackShopResponse(
        domains = listOf(
            PackShopSection(
                "avatar-ring",
                listOf(ShopPack(slug = "prestige", price = 90, owned = false), ShopPack(slug = "aurore", price = 40, owned = false)),
            ),
        ),
        balance = 340,
    )

    private fun event(slug: String) = PackInstallationUpdatedEvent("avatar-ring", slug, installed = true, owned = true, at = "t")

    private suspend fun cachedRings() =
        KeyedJsonCache(db.keyedJsonCacheDao(), clock).get("pack-shop", "offered", PackShopResponse.serializer())
            ?.value?.packs(AppearancePackDomain.AVATAR_RING).orEmpty()

    @Test
    fun `an event that arrived under A and is folded after B signed in owns nothing in B's shop`(): Unit = runBlocking {
        val subject = SocketInboundRoute.subject<PackInstallationUpdatedEvent>()
        val messages = mockk<MessageSocketManager>()
        every { messages.packInstallationUpdated } returns subject.exposed()
        coEvery { api.shop(any()) } returns ApiResponse(success = true, data = shop)
        val repository = PackShopRepository(api, KeyedJsonCache(db.keyedJsonCacheDao(), clock, fence), clock, fence)
        val binding = PackInstallationSocketBinding(messages, repository, io.asCoroutineDispatcher())
        binding.attach()
        withTimeout(5_000) {
            while (subject.subscriptionCount.value + ArrivalLedger.twinOf(subject).subscriptionCount.value == 0) delay(5)
        }
        val held = CountDownLatch(1)
        io.execute { held.await() }

        ArrivalStamp.under(fence.ticket()) { subject.emitArrived(event("prestige")) }
        owner.id = null
        transition.bumpGeneration()
        fence.close { db.clearAllTables() }
        owner.id = "B"
        transition.bumpGeneration()
        repository.refresh()
        ArrivalStamp.under(fence.ticket()) { subject.emitArrived(event("aurore")) }
        held.countDown()

        withTimeout(5_000) { while (cachedRings().firstOrNull { it.slug == "aurore" }?.isOwned != true) delay(5) }
        assertThat(cachedRings().single { it.slug == "prestige" }.isOwned).isFalse()
        assertThat(cachedRings().single { it.slug == "prestige" }.installed).isFalse()
        binding.detach()
    }
}
