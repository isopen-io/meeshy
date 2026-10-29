package me.meeshy.sdk.model.packs

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import org.junit.Test

class PackShopTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    private fun pack(
        slug: String = "heritages",
        price: Int? = null,
        owned: Boolean? = null,
        requirementPreview: String? = null,
    ): ShopPack = json.decodeFromString(
        ShopPack.serializer(),
        buildString {
            append("""{"slug":"$slug"""")
            price?.let { append(""","price":$it""") }
            owned?.let { append(""","owned":$it""") }
            requirementPreview?.let { append(""","requirementPreview":$it""") }
            append("}")
        },
    )

    @Test
    fun `a pack with no price from an old server reads free and owned`() {
        val old = pack()

        assertThat(old.isOwned).isTrue()
        assertThat(old.needsPurchase).isFalse()
        assertThat(old.meeshes).isNull()
    }

    @Test
    fun `a zero or negative price reads free, never a purchase of nothing`() {
        assertThat(pack(price = 0).meeshes).isNull()
        assertThat(pack(price = -5).needsPurchase).isFalse()
    }

    @Test
    fun `a paid pack is owned only when the server says so`() {
        assertThat(pack(price = 120).isOwned).isFalse()
        assertThat(pack(price = 120).canBuy).isTrue()
        assertThat(pack(price = 120, owned = true).isOwned).isTrue()
        assertThat(pack(price = 120, owned = true).canBuy).isFalse()
    }

    @Test
    fun `a pack to earn is not owned just because it has no price`() {
        val toEarn = pack(requirementPreview = """{"met":false}""")

        assertThat(toEarn.isOwned).isFalse()
        assertThat(toEarn.isLocked).isTrue()
    }

    @Test
    fun `a locked paid pack cannot be bought`() {
        val locked = pack(price = 80, requirementPreview = """{"met":false}""")

        assertThat(locked.needsPurchase).isTrue()
        assertThat(locked.canBuy).isFalse()
        assertThat(pack(price = 80, requirementPreview = """{"met":true}""").canBuy).isTrue()
    }

    @Test
    fun `an unreadable preview locks nothing`() {
        assertThat(pack(price = 80, requirementPreview = """"nonsense"""").isLocked).isFalse()
    }

    @Test
    fun `the name follows the reader language and falls back to the served one`() {
        val named = json.decodeFromString(
            ShopPack.serializer(),
            """{"slug":"a","name":"Héritages","names":{"en":{"name":"Heritage","description":"Old"},"de":"broken"}}""",
        )

        assertThat(named.localizedName("en-US")).isEqualTo("Heritage")
        assertThat(named.localizedDescription("en")).isEqualTo("Old")
        assertThat(named.localizedName("de")).isEqualTo("Héritages")
        assertThat(named.localizedName("fr")).isEqualTo("Héritages")
        assertThat(pack(slug = "bare").localizedName("fr")).isEqualTo("bare")
    }

    private val served = """
        {"success":true,"balance":340,"domains":[
          {"domain":"wallpaper","packs":[{"slug":"essentiels","owned":true},{"slug":null},{"slug":"animes","price":90,"owned":false}]},
          {"domain":"hologram","packs":[{"slug":"x"}]},
          "junk",
          {"domain":"avatar-ring","packs":[{"slug":"contours","price":40}]}
        ]}
    """.trimIndent()

    @Test
    fun `an unreadable pack or section falls alone and a domain unknown here is not shown`() {
        val shop = json.decodeFromString(PackShopResponse.serializer(), served)

        assertThat(shop.balance).isEqualTo(340)
        assertThat(shop.packs(AppearancePackDomain.WALLPAPER).map { it.slug }).containsExactly("essentiels", "animes").inOrder()
        assertThat(shop.packs(AppearancePackDomain.AVATAR_RING).map { it.slug }).containsExactly("contours")
        assertThat(shop.packs(AppearancePackDomain.BANNER)).isEmpty()
    }

    @Test
    fun `a confirmed purchase takes the served pack and the served balance`() {
        val shop = json.decodeFromString(PackShopResponse.serializer(), served)
        val bought = PackPurchaseResponse(pack("animes", price = 90, owned = true), balance = 250)

        val next = shop.applying(AppearancePackDomain.WALLPAPER, bought)

        assertThat(next.balance).isEqualTo(250)
        assertThat(next.packs(AppearancePackDomain.WALLPAPER).first { it.slug == "animes" }.isOwned).isTrue()
        assertThat(next.packs(AppearancePackDomain.WALLPAPER).first { it.slug == "essentiels" }).isEqualTo(shop.packs(AppearancePackDomain.WALLPAPER).first())
        assertThat(next.packs(AppearancePackDomain.AVATAR_RING)).isEqualTo(shop.packs(AppearancePackDomain.AVATAR_RING))
    }

    @Test
    fun `a purchase answer without a balance leaves the balance for the next read`() {
        val shop = json.decodeFromString(PackShopResponse.serializer(), served)

        val next = shop.applying(AppearancePackDomain.WALLPAPER, PackPurchaseResponse(pack("animes", owned = true), balance = null))

        assertThat(next.balance).isEqualTo(340)
    }

    @Test
    fun `a purchase never applies to the same slug of another domain`() {
        val shop = PackShopResponse(
            domains = listOf(
                PackShopSection("wallpaper", listOf(pack("same", price = 10))),
                PackShopSection("banner", listOf(pack("same", price = 10))),
            ),
            balance = 50,
        )

        val next = shop.applying(AppearancePackDomain.BANNER, PackPurchaseResponse(pack("same", price = 10, owned = true), 40))

        assertThat(next.packs(AppearancePackDomain.WALLPAPER).single().isOwned).isFalse()
        assertThat(next.packs(AppearancePackDomain.BANNER).single().isOwned).isTrue()
    }

    @Test
    fun `a link domain resolves to an offered one, the first when absent or unknown`() {
        assertThat(PackShopResponse.domainOf("banner")).isEqualTo(AppearancePackDomain.BANNER)
        assertThat(PackShopResponse.domainOf(" Avatar-Ring ")).isEqualTo(AppearancePackDomain.AVATAR_RING)
        assertThat(PackShopResponse.domainOf("sticker")).isEqualTo(AppearancePackDomain.WALLPAPER)
        assertThat(PackShopResponse.domainOf(null)).isEqualTo(AppearancePackDomain.WALLPAPER)
    }

    @Test
    fun `the cache round trip keeps what the server served`() {
        val shop = json.decodeFromString(PackShopResponse.serializer(), served)

        val again = json.decodeFromString(PackShopResponse.serializer(), json.encodeToString(PackShopResponse.serializer(), shop))

        assertThat(again).isEqualTo(shop)
    }
}
