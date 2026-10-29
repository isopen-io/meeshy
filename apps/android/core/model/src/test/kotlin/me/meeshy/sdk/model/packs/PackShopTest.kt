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

    private fun installShop(vararg packs: ShopPack) =
        PackShopResponse(domains = listOf(PackShopSection("wallpaper", packs.toList())), balance = 340)

    @Test
    fun `an owned or free pack can be toggled, a pack to buy or still locked cannot`() {
        assertThat(pack(price = 90, owned = true).canToggleInstall).isTrue()
        assertThat(pack().canToggleInstall).isTrue()
        assertThat(pack(price = 90, owned = false).canToggleInstall).isFalse()
        assertThat(pack(requirementPreview = """{"met":false}""").canToggleInstall).isFalse()
    }

    @Test
    fun `a pack to earn whose goal is met but not yet granted cannot be installed, the server would refuse it`() {
        val metNotGranted = pack(owned = false, requirementPreview = """{"met":true}""")

        assertThat(metNotGranted.isLocked).isFalse()
        assertThat(metNotGranted.needsPurchase).isFalse()
        assertThat(metNotGranted.canToggleInstall).isFalse()
        assertThat(pack(owned = false).canToggleInstall).isFalse()
        assertThat(pack(owned = false).copy(installed = true).canToggleInstall).isTrue()
    }

    @Test
    fun `a locked pack that is already installed can still be removed`() {
        val installedLocked = pack(requirementPreview = """{"met":false}""").copy(installed = true)

        assertThat(installedLocked.canToggleInstall).isTrue()
    }

    @Test
    fun `toggling an install flips only the installed flag and its count, never ownership or balance`() {
        val shop = installShop(ShopPack(slug = "animes", price = 90, owned = true, installed = false, installCount = 4))

        val next = shop.togglingInstall(AppearancePackDomain.WALLPAPER, "animes")!!

        val after = next.packs(AppearancePackDomain.WALLPAPER).single()
        assertThat(after.installed).isTrue()
        assertThat(after.installCount).isEqualTo(5)
        assertThat(after.owned).isTrue()
        assertThat(next.balance).isEqualTo(340)
    }

    @Test
    fun `removing never takes the count below zero`() {
        val shop = installShop(ShopPack(slug = "animes", owned = true, installed = true, installCount = 0))

        val after = shop.togglingInstall(AppearancePackDomain.WALLPAPER, "animes")!!.packs(AppearancePackDomain.WALLPAPER).single()

        assertThat(after.installed).isFalse()
        assertThat(after.installCount).isEqualTo(0)
    }

    @Test
    fun `a pack to buy, locked, or unknown is never toggled`() {
        val shop = installShop(ShopPack(slug = "animes", price = 90, owned = false))

        assertThat(shop.togglingInstall(AppearancePackDomain.WALLPAPER, "animes")).isNull()
        assertThat(shop.togglingInstall(AppearancePackDomain.WALLPAPER, "absent")).isNull()
        assertThat(shop.togglingInstall(AppearancePackDomain.BANNER, "animes")).isNull()
    }

    @Test
    fun `a confirmed install takes the served installed state and count of that pack alone`() {
        val shop = installShop(
            ShopPack(slug = "animes", owned = true, installed = true, installCount = 5),
            ShopPack(slug = "autre", owned = true, installed = false, installCount = 1),
        )

        val next = shop.installSettled(AppearancePackDomain.WALLPAPER, ShopPack(slug = "animes", installed = false, installCount = 7))

        val packs = next.packs(AppearancePackDomain.WALLPAPER)
        assertThat(packs.first { it.slug == "animes" }.installed).isFalse()
        assertThat(packs.first { it.slug == "animes" }.installCount).isEqualTo(7)
        assertThat(packs.first { it.slug == "animes" }.owned).isTrue()
        assertThat(packs.first { it.slug == "autre" }).isEqualTo(shop.packs(AppearancePackDomain.WALLPAPER).last())
    }

    @Test
    fun `a refused install puts the previous pack back and leaves the rest as the server last said`() {
        val before = ShopPack(slug = "animes", owned = true, installed = false, installCount = 4)
        val optimistic = installShop(before).togglingInstall(AppearancePackDomain.WALLPAPER, "animes")!!.withBalance(120)

        val back = optimistic.restoring(AppearancePackDomain.WALLPAPER, before)

        assertThat(back.packs(AppearancePackDomain.WALLPAPER).single()).isEqualTo(before)
        assertThat(back.balance).isEqualTo(120)
    }

    @Test
    fun `a served cover is the path to load, blank or absent is none`() {
        assertThat(ShopPack(slug = "a", coverUrl = " /api/v1/pack-assets/aaaaaaaaaaaaaaaa.webp ").coverPath)
            .isEqualTo("/api/v1/pack-assets/aaaaaaaaaaaaaaaa.webp")
        assertThat(ShopPack(slug = "a", coverUrl = "  ").coverPath).isNull()
        assertThat(ShopPack(slug = "a").coverPath).isNull()
    }

    @Test
    fun `a cover thumb hash is read when the server serves one and ignored otherwise`() {
        val with = json.decodeFromString(ShopPack.serializer(), """{"slug":"a","coverUrl":"/x.webp","coverThumbHash":"3OcRJYB4d3h/iIeHeEh3eIhw+j3A"}""")

        assertThat(with.coverThumbHash).isEqualTo("3OcRJYB4d3h/iIeHeEh3eIhw+j3A")
        assertThat(pack().coverThumbHash).isNull()
    }

    @Test
    fun `a legacy per domain catalogue is composed into a shop with no balance`() {
        val composed = PackShopResponse.composed(
            listOf(
                AppearancePackDomain.WALLPAPER to listOf(ShopPack(slug = "animes")),
                AppearancePackDomain.BANNER to emptyList(),
            ),
        )

        assertThat(composed.balance).isNull()
        assertThat(composed.packs(AppearancePackDomain.WALLPAPER).map { it.slug }).containsExactly("animes")
        assertThat(composed.packs(AppearancePackDomain.BANNER)).isEmpty()
        assertThat(composed.domains.map { it.domain }).containsExactly("wallpaper", "banner").inOrder()
    }
}
