package me.meeshy.sdk.packs

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.flow.first
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

    @Test fun `sign out wipes the shop of the account`() = runTest {
        coEvery { api.shop(domains) } returns ApiResponse(success = true, data = shop())
        val repository = repository()
        repository.refresh()

        repository.clear()

        assertThat(cache().get("pack-shop", "offered", PackShopResponse.serializer())).isNull()
    }
}
