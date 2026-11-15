package me.meeshy.sdk.packs

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.game.GameUpdatedEvent
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
 * `game:updated` tient le solde de la vitrine : le serveur seul le fixe, l'événement est reporté tel quel, sous le compte
 * auquel il est ARRIVÉ, et jamais un état plus ancien que le dernier appliqué ne le fait reculer.
 */
@RunWith(RobolectricTestRunner::class)
class PackShopBalanceTest {

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
    private val domains = "wallpaper,avatar-ring,banner,banner-frame"
    private val json = Json { ignoreUnknownKeys = true }

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() {
        io.shutdownNow()
        db.close()
    }

    private fun shop(balance: Int = 340) = PackShopResponse(
        domains = listOf(PackShopSection("wallpaper", listOf(ShopPack(slug = "animes", price = 90, owned = false)))),
        balance = balance,
    )

    private fun held(balance: Int): JsonElement = json.parseToJsonElement("""{"treasury":{"held":$balance}}""")

    private fun event(revision: Long?, balance: Int?) =
        GameUpdatedEvent(gameRevision = revision, reason = "spend", game = balance?.let(::held))

    private fun repository() = PackShopRepository(api, KeyedJsonCache(db.keyedJsonCacheDao(), clock, fence), clock, fence)

    private suspend fun cachedBalance() =
        KeyedJsonCache(db.keyedJsonCacheDao(), clock).get("pack-shop", "offered", PackShopResponse.serializer())?.value?.balance

    @Test fun `a game event moves the balance the shop shows, without reading the network again`() = runBlocking {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = shop(340))
        val repository = repository().also { it.refresh() }

        repository.onGameUpdated(event(1_000, 250), repository.installationTicket())

        assertThat(cachedBalance()).isEqualTo(250)
        coVerify(exactly = 1) { api.shop(domains) }
    }

    @Test fun `an event older than the last applied one never moves the balance back`() = runBlocking {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = shop(340))
        val repository = repository().also { it.refresh() }
        repository.onGameUpdated(event(2_000, 250), repository.installationTicket())

        repository.onGameUpdated(event(1_000, 340), repository.installationTicket())

        assertThat(cachedBalance()).isEqualTo(250)
    }

    @Test fun `an event of the same revision or without a revision still applies`() = runBlocking {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = shop(340))
        val repository = repository().also { it.refresh() }
        repository.onGameUpdated(event(2_000, 250), repository.installationTicket())

        repository.onGameUpdated(event(2_000, 240), repository.installationTicket())
        assertThat(cachedBalance()).isEqualTo(240)
        repository.onGameUpdated(event(null, 230), repository.installationTicket())
        assertThat(cachedBalance()).isEqualTo(230)
    }

    @Test fun `an event with no readable block only asks the shop to be read again`() = runBlocking {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = shop(340))
        val repository = repository().also { it.refresh() }
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = shop(120))

        repository.onGameUpdated(event(1_000, null), repository.installationTicket())

        assertThat(cachedBalance()).isEqualTo(120)
    }

    @Test fun `an event taken under A and folded after B signed in never writes B's balance`() = runBlocking {
        val subject = SocketInboundRoute.subject<GameUpdatedEvent>()
        val messages = mockk<MessageSocketManager>()
        every { messages.gameUpdated } returns subject.exposed()
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = shop(340))
        val repository = repository()
        val binding = GameBalanceSocketBinding(messages, repository, io.asCoroutineDispatcher())
        binding.attach()
        withTimeout(5_000) {
            while (subject.subscriptionCount.value + ArrivalLedger.twinOf(subject).subscriptionCount.value == 0) delay(5)
        }
        val gate = CountDownLatch(1)
        io.execute { gate.await() }

        ArrivalStamp.under(fence.ticket()) { subject.emitArrived(event(5_000, 7)) }
        owner.id = null
        transition.bumpGeneration()
        fence.close { db.clearAllTables() }
        owner.id = "B"
        transition.bumpGeneration()
        repository.refresh()
        gate.countDown()
        delay(300)

        assertThat(cachedBalance()).isEqualTo(340)
        binding.detach()
    }

    @Test fun `the live event of the current account reaches the shop through the binding`() = runBlocking {
        val subject = SocketInboundRoute.subject<GameUpdatedEvent>()
        val messages = mockk<MessageSocketManager>()
        every { messages.gameUpdated } returns subject.exposed()
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = shop(340))
        val repository = repository().also { it.refresh() }
        val binding = GameBalanceSocketBinding(messages, repository, io.asCoroutineDispatcher())
        binding.attach()
        withTimeout(5_000) {
            while (subject.subscriptionCount.value + ArrivalLedger.twinOf(subject).subscriptionCount.value == 0) delay(5)
        }

        ArrivalStamp.under(fence.ticket()) { subject.emitArrived(event(5_000, 250)) }

        withTimeout(5_000) { while (cachedBalance() != 250) delay(5) }
        binding.detach()
    }

    @Test fun `sign out forgets the revision so the next account is not held to the previous one`() = runBlocking {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = shop(340))
        val repository = repository().also { it.refresh() }
        repository.onGameUpdated(event(9_000, 250), repository.installationTicket())

        repository.clear()
        repository.refresh()
        repository.onGameUpdated(event(1_000, 100), repository.installationTicket())

        assertThat(cachedBalance()).isEqualTo(100)
    }
}
