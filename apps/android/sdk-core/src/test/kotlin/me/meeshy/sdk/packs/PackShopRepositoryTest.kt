package me.meeshy.sdk.packs

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.packs.PackPurchaseRefusal
import me.meeshy.sdk.model.packs.PackPurchaseRequest
import me.meeshy.sdk.model.packs.PackPurchaseResponse
import me.meeshy.sdk.model.packs.PackShopFailure
import me.meeshy.sdk.model.packs.PackShopResponse
import me.meeshy.sdk.model.packs.PackShopSection
import me.meeshy.sdk.model.packs.ShopPack
import me.meeshy.sdk.net.api.PackApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.HttpException
import retrofit2.Response

@RunWith(RobolectricTestRunner::class)
class PackShopRepositoryTest {

    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock()
    private val api = mockk<PackApi>()
    private val domains = "wallpaper,avatar-ring,banner,banner-frame"

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun cache() = KeyedJsonCache(db.keyedJsonCacheDao(), clock)

    private fun repository() = PackShopRepository(api, cache(), clock)

    private fun shop(balance: Int = 340, owned: Boolean = false) = PackShopResponse(
        domains = listOf(PackShopSection("wallpaper", listOf(ShopPack(slug = "animes", price = 90, owned = owned)))),
        balance = balance,
    )

    private fun refusal(status: Int, code: String): HttpException = HttpException(
        Response.error<Any>(
            status,
            """{"success":false,"error":"$code","code":"$code"}""".toResponseBody("application/json".toMediaType()),
        ),
    )

    @Test fun `cold the shop is served as the server serves it`() = runTest {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = shop())

        val served = repository().shop().first { it.valueOrNull != null }.valueOrNull!!

        assertThat(served.balance).isEqualTo(340)
    }

    @Test fun `an open shop reads the server once, not again after each answer it writes`() = kotlinx.coroutines.runBlocking {
        val ticking = object : me.meeshy.sdk.cache.CacheClock {
            var now = 1_000_000L
            override fun nowMillis(): Long = now++
        }
        val repository = PackShopRepository(api, KeyedJsonCache(db.keyedJsonCacheDao(), ticking), ticking)
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = shop())

        val burst = kotlinx.coroutines.withTimeoutOrNull(1_500) { repository.shop().take(6).toList() }

        assertThat(burst).isNull()
        io.mockk.coVerify(exactly = 1) { api.shop(domains) }
    }

    @Test fun `on a non empty cache the shop paints the cached value and a network failure empties nothing`() = runTest {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = shop())
        repository().refresh()
        coEvery { api.shop(domains) } throws IOException("offline")

        val first = repository().shop().first()

        assertThat(first.valueOrNull!!.balance).isEqualTo(340)
    }

    @Test fun `a confirmed purchase writes the served pack and balance into the cache`() = runTest {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = shop())
        val repository = repository()
        repository.refresh()
        coEvery { api.purchase("wallpaper", "animes", PackPurchaseRequest("r1")) } returns ApiResponse(
            success = true,
            data = PackPurchaseResponse(ShopPack(slug = "animes", price = 90, owned = true, installed = true), balance = 250),
        )

        val outcome = repository.purchase(AppearancePackDomain.WALLPAPER, "animes", "r1")

        assertThat(outcome).isInstanceOf(PackPurchaseOutcome.Done::class.java)
        val cached = cache().get("pack-shop", "offered", PackShopResponse.serializer())!!.value
        assertThat(cached.balance).isEqualTo(250)
        assertThat(cached.packs(AppearancePackDomain.WALLPAPER).single().isOwned).isTrue()
    }

    @Test fun `a shop read that left before a confirmed purchase never paints the pack back as unbought`() = kotlinx.coroutines.runBlocking {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = shop())
        val repository = repository()
        repository.refresh()
        val asked = kotlinx.coroutines.CompletableDeferred<Unit>()
        val gate = kotlinx.coroutines.CompletableDeferred<Unit>()
        coEvery { api.shop(domains) } coAnswers {
            asked.complete(Unit)
            gate.await()
            ApiResponse(success = true, data = shop())
        }
        coEvery { api.purchase("wallpaper", "animes", PackPurchaseRequest("r1")) } returns ApiResponse(
            success = true,
            data = PackPurchaseResponse(ShopPack(slug = "animes", price = 90, owned = true, installed = true), balance = 250),
        )

        val read = async(kotlinx.coroutines.Dispatchers.Default) { repository.refresh() }
        asked.await()
        repository.purchase(AppearancePackDomain.WALLPAPER, "animes", "r1")
        gate.complete(Unit)
        read.await()

        val cached = cache().get("pack-shop", "offered", PackShopResponse.serializer())!!.value
        assertThat(cached.balance).isEqualTo(250)
        assertThat(cached.packs(AppearancePackDomain.WALLPAPER).single().isOwned).isTrue()
    }

    @Test fun `a refused purchase leaves the cache exactly as the server last served it`() = runTest {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = shop())
        val repository = repository()
        repository.refresh()
        coEvery { api.purchase(any<String>(), any(), any()) } throws refusal(409, "INSUFFICIENT_MEESHES")

        val outcome = repository.purchase(AppearancePackDomain.WALLPAPER, "animes", "r1")

        assertThat(outcome).isEqualTo(
            PackPurchaseOutcome.Refused(PackPurchaseRefusal(PackShopFailure.INSUFFICIENT_MEESHES, definitive = true)),
        )
        assertThat(cache().get("pack-shop", "offered", PackShopResponse.serializer())!!.value).isEqualTo(shop())
    }

    @Test fun `a cut connection is a transient refusal that keeps the gesture replayable`() = runTest {
        coEvery { api.purchase(any<String>(), any(), any()) } throws IOException("offline")

        val outcome = repository().purchase(AppearancePackDomain.WALLPAPER, "animes", "r1")

        assertThat((outcome as PackPurchaseOutcome.Refused).refusal.definitive).isFalse()
    }

    private class Owner(var id: String?) : me.meeshy.sdk.outbox.OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    @Test fun `a purchase answered after the account changed writes nothing into the next account's shop`() = runTest {
        val owner = Owner("A")
        val fence = me.meeshy.sdk.session.AccountFence(owner, me.meeshy.sdk.net.SessionTransitionFlags())
        val fenced = KeyedJsonCache(db.keyedJsonCacheDao(), clock, fence)
        val repository = PackShopRepository(api, fenced, clock)
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = shop())
        repository.refresh()
        coEvery { api.purchase("wallpaper", "animes", PackPurchaseRequest("r1")) } answers {
            owner.id = "B"
            ApiResponse(
                success = true,
                data = PackPurchaseResponse(ShopPack(slug = "animes", price = 90, owned = true, installed = true), balance = 250),
            )
        }

        repository.purchase(AppearancePackDomain.WALLPAPER, "animes", "r1")

        assertThat(cache().get("pack-shop", "offered", PackShopResponse.serializer())!!.value).isEqualTo(shop())
    }

    @Test fun `sign out wipes the shop of the account`() = runTest {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = shop())
        val repository = repository()
        repository.refresh()

        repository.clear()

        assertThat(cache().get("pack-shop", "offered", PackShopResponse.serializer())).isNull()
    }

    private fun ringShop(owned: Boolean = false) = PackShopResponse(
        domains = listOf(PackShopSection("avatar-ring", listOf(ShopPack(slug = "prestige", price = 90, owned = owned)))),
        balance = 340,
    )

    private val ringEvent = me.meeshy.sdk.model.packs.PackInstallationUpdatedEvent("avatar-ring", "prestige", installed = true, owned = true, at = "t")

    @Test fun `an installation event from another device flips the cached pack and is announced, with no network read`() = runTest {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = ringShop())
        val repository = repository()
        repository.refresh()
        val announced = async(kotlinx.coroutines.Dispatchers.Unconfined) { repository.installations.first() }

        repository.onInstallationUpdated(ringEvent, ticket = null)

        val cached = cache().get("pack-shop", "offered", PackShopResponse.serializer())!!.value
        assertThat(cached.packs(AppearancePackDomain.AVATAR_RING).single().isOwned).isTrue()
        assertThat(cached.packs(AppearancePackDomain.AVATAR_RING).single().installed).isTrue()
        assertThat(announced.await()).isEqualTo(ringEvent)
        io.mockk.coVerify(exactly = 1) { api.shop(domains) }
    }

    @Test fun `an event taken under an account that has since closed neither writes nor is announced`() = runTest {
        val owner = Owner("A")
        val fence = me.meeshy.sdk.session.AccountFence(owner, me.meeshy.sdk.net.SessionTransitionFlags())
        val repository = PackShopRepository(api, KeyedJsonCache(db.keyedJsonCacheDao(), clock, fence), clock, fence)
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = ringShop())
        repository.refresh()
        val ticket = fence.ticket()
        val announced = mutableListOf<me.meeshy.sdk.model.packs.PackInstallationUpdatedEvent>()
        val collecting = launch(kotlinx.coroutines.Dispatchers.Unconfined) { repository.installations.collect { announced += it } }

        owner.id = "B"
        repository.onInstallationUpdated(ringEvent, ticket)
        collecting.cancel()

        assertThat(cache().get("pack-shop", "offered", PackShopResponse.serializer())!!.value).isEqualTo(ringShop())
        assertThat(announced).isEmpty()
    }

    @Test fun `an event with the cache empty is still announced so the sheet can follow`() = runTest {
        val repository = repository()
        val announced = async(kotlinx.coroutines.Dispatchers.Unconfined) { repository.installations.first() }

        repository.onInstallationUpdated(ringEvent, ticket = null)

        assertThat(announced.await()).isEqualTo(ringEvent)
    }

    @Test fun `a shop read that left before an installation event does not erase it when it lands`() = runTest {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = ringShop())
        val repository = repository()
        repository.refresh()
        val gate = kotlinx.coroutines.CompletableDeferred<Unit>()
        coEvery { api.shop(domains) } coAnswers {
            gate.await()
            ApiResponse(success = true, data = ringShop())
        }
        val reading = async { repository.refresh() }
        testScheduler.runCurrent()

        repository.onInstallationUpdated(ringEvent, ticket = null)
        gate.complete(Unit)
        reading.await()

        val cached = cache().get("pack-shop", "offered", PackShopResponse.serializer())!!.value
        assertThat(cached.packs(AppearancePackDomain.AVATAR_RING).single().isOwned).isTrue()
        assertThat(cached.packs(AppearancePackDomain.AVATAR_RING).single().installed).isTrue()
    }

    private fun ownedRingShop() = PackShopResponse(
        domains = listOf(PackShopSection("avatar-ring", listOf(ShopPack(slug = "prestige", price = 90, owned = true, installCount = 4)))),
        balance = 340,
    )

    private fun httpError(status: Int, code: String? = null): HttpException = HttpException(
        Response.error<Any>(
            status,
            """{"success":false,"error":"x"${code?.let { ""","code":"$it"""" } ?: ""}}""".toResponseBody("application/json".toMediaType()),
        ),
    )

    @Test fun `a confirmed install writes the served state into the shop cache and announces it to the profile`() = runTest {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = ownedRingShop())
        val repository = repository()
        repository.refresh()
        coEvery { api.install("avatar-ring", "prestige") } returns ApiResponse(
            success = true,
            data = ShopPack(slug = "prestige", price = 90, owned = true, installed = true, installCount = 5),
        )
        val announced = async(kotlinx.coroutines.Dispatchers.Unconfined) { repository.installations.first() }

        val outcome = repository.setInstalled(AppearancePackDomain.AVATAR_RING, "prestige", installed = true)

        assertThat(outcome).isInstanceOf(PackInstallOutcome.Done::class.java)
        val cached = cache().get("pack-shop", "offered", PackShopResponse.serializer())!!.value
        val pack = cached.packs(AppearancePackDomain.AVATAR_RING).single()
        assertThat(pack.installed).isTrue()
        assertThat(pack.installCount).isEqualTo(5)
        assertThat(cached.balance).isEqualTo(340)
        assertThat(announced.await())
            .isEqualTo(me.meeshy.sdk.model.packs.PackInstallationUpdatedEvent("avatar-ring", "prestige", installed = true, owned = true))
    }

    @Test fun `removing a pack deletes its install and announces the removal`() = runTest {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = ownedRingShop())
        val repository = repository()
        repository.refresh()
        coEvery { api.uninstall("avatar-ring", "prestige") } returns ApiResponse(
            success = true,
            data = ShopPack(slug = "prestige", price = 90, owned = true, installed = false, installCount = 3),
        )
        val announced = async(kotlinx.coroutines.Dispatchers.Unconfined) { repository.installations.first() }

        repository.setInstalled(AppearancePackDomain.AVATAR_RING, "prestige", installed = false)

        assertThat(announced.await().installed).isFalse()
        io.mockk.coVerify(exactly = 1) { api.uninstall("avatar-ring", "prestige") }
    }

    @Test fun `a removal never announces a possession the server did not check`() = runTest {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = ownedRingShop())
        val repository = repository()
        repository.refresh()
        coEvery { api.uninstall("avatar-ring", "prestige") } returns ApiResponse(
            success = true,
            data = ShopPack(slug = "prestige", owned = true, installed = false, installCount = 3),
        )
        val announced = async(kotlinx.coroutines.Dispatchers.Unconfined) { repository.installations.first() }

        repository.setInstalled(AppearancePackDomain.AVATAR_RING, "prestige", installed = false)

        assertThat(announced.await().owned).isNull()
    }

    @Test fun `a refused install changes nothing, announces nothing, and a not owned pack is a definitive refusal`() = runTest {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = ownedRingShop())
        val repository = repository()
        repository.refresh()
        coEvery { api.install(any(), any()) } throws httpError(403, "PACK_NOT_OWNED")
        val announced = mutableListOf<me.meeshy.sdk.model.packs.PackInstallationUpdatedEvent>()
        val collecting = launch(kotlinx.coroutines.Dispatchers.Unconfined) { repository.installations.collect { announced += it } }

        val outcome = repository.setInstalled(AppearancePackDomain.AVATAR_RING, "prestige", installed = true)
        collecting.cancel()

        assertThat((outcome as PackInstallOutcome.Refused).refusal.definitive).isTrue()
        assertThat(cache().get("pack-shop", "offered", PackShopResponse.serializer())!!.value).isEqualTo(ownedRingShop())
        assertThat(announced).isEmpty()
    }

    @Test fun `a cut connection during an install is transient`() = runTest {
        coEvery { api.install(any(), any()) } throws IOException("offline")

        val outcome = repository().setInstalled(AppearancePackDomain.AVATAR_RING, "prestige", installed = true)

        assertThat((outcome as PackInstallOutcome.Refused).refusal.definitive).isFalse()
    }

    @Test fun `an install answered after the account changed writes nothing and announces nothing`() = runTest {
        val owner = Owner("A")
        val fence = me.meeshy.sdk.session.AccountFence(owner, me.meeshy.sdk.net.SessionTransitionFlags())
        val repository = PackShopRepository(api, KeyedJsonCache(db.keyedJsonCacheDao(), clock, fence), clock, fence)
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = ownedRingShop())
        repository.refresh()
        coEvery { api.install("avatar-ring", "prestige") } answers {
            owner.id = "B"
            ApiResponse(success = true, data = ShopPack(slug = "prestige", owned = true, installed = true, installCount = 5))
        }
        val announced = mutableListOf<me.meeshy.sdk.model.packs.PackInstallationUpdatedEvent>()
        val collecting = launch(kotlinx.coroutines.Dispatchers.Unconfined) { repository.installations.collect { announced += it } }

        repository.setInstalled(AppearancePackDomain.AVATAR_RING, "prestige", installed = true)
        collecting.cancel()

        assertThat(cache().get("pack-shop", "offered", PackShopResponse.serializer())!!.value).isEqualTo(ownedRingShop())
        assertThat(announced).isEmpty()
    }

    @Test fun `a shop read that left before a confirmed install does not erase it when it lands`() = runTest {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = ownedRingShop())
        val repository = repository()
        repository.refresh()
        val gate = kotlinx.coroutines.CompletableDeferred<Unit>()
        coEvery { api.shop(domains) } coAnswers {
            gate.await()
            ApiResponse(success = true, data = ownedRingShop())
        }
        coEvery { api.install("avatar-ring", "prestige") } returns ApiResponse(
            success = true,
            data = ShopPack(slug = "prestige", owned = true, installed = true, installCount = 5),
        )
        val reading = async { repository.refresh() }
        testScheduler.runCurrent()

        repository.setInstalled(AppearancePackDomain.AVATAR_RING, "prestige", installed = true)
        gate.complete(Unit)
        reading.await()

        val cached = cache().get("pack-shop", "offered", PackShopResponse.serializer())!!.value
        assertThat(cached.packs(AppearancePackDomain.AVATAR_RING).single().installed).isTrue()
    }

    @Test fun `an old server without the shop route composes the shop domain by domain, an unserved domain is empty`() = runTest {
        coEvery { api.shop(domains) } throws httpError(404)
        coEvery { api.catalogue("wallpaper") } returns ApiResponse(
            success = true,
            data = me.meeshy.sdk.model.packs.ShopPackCatalogue(listOf(ShopPack(slug = "animes", installed = true))),
        )
        coEvery { api.catalogue("avatar-ring") } throws httpError(404)
        coEvery { api.catalogue("banner") } returns ApiResponse(
            success = true,
            data = me.meeshy.sdk.model.packs.ShopPackCatalogue(listOf(ShopPack(slug = "b1"))),
        )
        coEvery { api.catalogue("banner-frame") } returns ApiResponse(
            success = true,
            data = me.meeshy.sdk.model.packs.ShopPackCatalogue(emptyList()),
        )

        val served = repository().shop().first { it.valueOrNull != null }.valueOrNull!!

        assertThat(served.balance).isNull()
        assertThat(served.packs(AppearancePackDomain.WALLPAPER).map { it.slug }).containsExactly("animes")
        assertThat(served.packs(AppearancePackDomain.AVATAR_RING)).isEmpty()
        assertThat(served.packs(AppearancePackDomain.BANNER).map { it.slug }).containsExactly("b1")
    }

    @Test fun `the fallback never hides a real failure behind an empty shop`() = runTest {
        coEvery { api.shop(domains) } throws httpError(404)
        coEvery { api.catalogue(any<String>()) } throws httpError(500)
        val repository = repository()

        val failure = runCatching { repository.refresh() }.exceptionOrNull()

        assertThat(failure).isInstanceOf(PackShopRepository.PackShopUnavailableException::class.java)
        assertThat(cache().get("pack-shop", "offered", PackShopResponse.serializer())).isNull()
    }

    @Test fun `a server error on the shop does not trigger the fallback`() = runTest {
        coEvery { api.shop(domains) } throws httpError(500)

        val failure = runCatching { repository().refresh() }.exceptionOrNull()

        assertThat(failure).isInstanceOf(PackShopRepository.PackShopUnavailableException::class.java)
        io.mockk.coVerify(exactly = 0) { api.catalogue(any<String>()) }
    }
}
