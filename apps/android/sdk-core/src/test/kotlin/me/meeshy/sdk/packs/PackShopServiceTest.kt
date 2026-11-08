package me.meeshy.sdk.packs

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.appearance.AppearancePackDomain
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

@RunWith(RobolectricTestRunner::class)
class PackShopServiceTest {

    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock()
    private val api = mockk<PackApi>()
    private val offered = "wallpaper,avatar-ring,banner,banner-frame"

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun repository() = PackShopRepository(api, KeyedJsonCache(db.keyedJsonCacheDao(), clock), clock)

    private fun shop(balance: Int) = PackShopResponse(
        domains = listOf(PackShopSection("wallpaper", listOf(ShopPack(slug = "animes", price = 90, owned = false)))),
        balance = balance,
    )

    @Test fun `a snapshot younger than a minute is served without any reread`() = runTest {
        coEvery { api.shop(offered) } returns ApiResponse(success = true, data = shop(340))
        val repository = repository()
        repository.refresh()
        clock.now += 30_000L

        val served = repository.shop().first()

        assertThat(served.valueOrNull!!.balance).isEqualTo(340)
        coVerify(exactly = 1) { api.shop(offered) }
    }

    @Test fun `a snapshot older than a minute is served at once and reread silently`() = runTest {
        coEvery { api.shop(offered) } returns ApiResponse(success = true, data = shop(340))
        val repository = repository()
        repository.refresh()
        clock.now += 2 * 60_000L
        coEvery { api.shop(offered) } returns ApiResponse(success = true, data = shop(250))

        val first = repository.shop().first()
        val reread = repository.shop().first { it.valueOrNull?.balance == 250 }

        assertThat(first.valueOrNull!!.balance).isEqualTo(340)
        assertThat(reread.valueOrNull!!.balance).isEqualTo(250)
    }

    @Test fun `a snapshot of six days is still painted while it is reread`() = runTest {
        coEvery { api.shop(offered) } returns ApiResponse(success = true, data = shop(340))
        val repository = repository()
        repository.refresh()
        clock.now += 6 * 24 * 60 * 60_000L
        coEvery { api.shop(offered) } throws IOException("offline")

        val first = repository.shop().first()

        assertThat(first.valueOrNull!!.balance).isEqualTo(340)
    }

    @Test fun `each set of domains is its own snapshot`() = runTest {
        coEvery { api.shop("banner") } returns ApiResponse(success = true, data = shop(10))
        coEvery { api.shop(offered) } returns ApiResponse(success = true, data = shop(340))
        val repository = repository()

        repository.refresh(listOf(AppearancePackDomain.BANNER))
        repository.refresh()

        val banner = KeyedJsonCache(db.keyedJsonCacheDao(), clock).get("pack-shop", "banner", PackShopResponse.serializer())!!.value
        val all = KeyedJsonCache(db.keyedJsonCacheDao(), clock).get("pack-shop", "offered", PackShopResponse.serializer())!!.value
        assertThat(banner.balance).isEqualTo(10)
        assertThat(all.balance).isEqualTo(340)
    }

    @Test fun `offline a purchase is refused as offline and replayable`() = runTest {
        coEvery { api.purchase(any<String>(), any(), any()) } throws IOException("offline")

        val outcome = repository().purchase(AppearancePackDomain.WALLPAPER, "animes", "r1") as PackPurchaseOutcome.Refused

        assertThat(outcome.refusal.failure).isEqualTo(PackShopFailure.OFFLINE)
        assertThat(outcome.refusal.definitive).isFalse()
    }

    @Test fun `a forbidden purchase asks for a reload of the shop`() = runTest {
        coEvery { api.purchase(any<String>(), any(), any()) } throws retrofit2.HttpException(
            retrofit2.Response.error<Any>(
                403,
                """{"success":false,"error":"FORBIDDEN","code":"FORBIDDEN"}""".let {
                    it.toResponseBody("application/json".toMediaType())
                },
            ),
        )

        val outcome = repository().purchase(AppearancePackDomain.WALLPAPER, "animes", "r1") as PackPurchaseOutcome.Refused

        assertThat(outcome.refusal.reloadsShop).isTrue()
        assertThat(outcome.refusal.definitive).isTrue()
    }

    @Test fun `unknown domains and unknown fields are tolerated when decoding the shop`() {
        val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

        val decoded = json.decodeFromString(
            PackShopResponse.serializer(),
            """{"domains":[{"domain":"capture-frame","packs":[{"slug":"x","future":1}],"extra":true},
                {"domain":"wallpaper","packs":[{"slug":"animes","price":90,"brandNew":{"a":1}}]}],"balance":12,"tomorrow":"?"}""",
        )

        assertThat(decoded.balance).isEqualTo(12)
        assertThat(decoded.packs(AppearancePackDomain.WALLPAPER).map { it.slug }).containsExactly("animes")
    }
}
