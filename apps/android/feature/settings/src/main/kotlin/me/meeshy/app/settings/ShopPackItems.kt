package me.meeshy.app.settings

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import me.meeshy.sdk.appearance.AppearanceCatalogLoader
import me.meeshy.sdk.model.ProfileDecorRef
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.AppearanceDesign
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.appearance.AvatarRingDesign
import me.meeshy.sdk.model.appearance.BannerFrameDesign
import me.meeshy.sdk.model.pack.PackAssetRef

/** Ce qu'un élément de pack peint, selon ce qu'il décore. `null` côté [ShopItem] : pas encore peignable sur cet appareil. */
sealed interface ShopItemArt {
    val animated: Boolean

    data class Ring(val design: AvatarRingDesign) : ShopItemArt {
        override val animated: Boolean get() = design.lottie != null || design.motion.isNotEmpty() || design.decor != null
    }

    data class Banner(val design: AppearanceDesign) : ShopItemArt {
        override val animated: Boolean get() = design.lottie != null
    }

    data class BannerFrame(val design: BannerFrameDesign) : ShopItemArt {
        override val animated: Boolean get() = design.lottie != null || design.motion.isNotEmpty()
    }

    data class Wallpaper(val design: AppearanceDesign) : ShopItemArt {
        override val animated: Boolean get() = design.lottie != null
    }
}

/** Un élément d'un pack de la boutique, nommé dans la langue du lecteur. */
data class ShopItem(
    val domain: AppearancePackDomain,
    val pack: String,
    val key: String,
    val name: String,
    val art: ShopItemArt?,
) {
    val ref: ProfileDecorRef get() = ProfileDecorRef(pack, key)
    val id: String get() = "${domain.wire}.$pack.$key"
}

/** Le contenu d'un pack tel que l'appareil sait le peindre. */
sealed interface ShopPackContents {
    /** [bytes] : le poids des fichiers du pack, `null` s'il est inconnu ; [embedded] : livré avec l'application. */
    data class Ready(val items: List<ShopItem>, val embedded: Boolean, val bytes: Long?) : ShopPackContents

    /** Le pack n'est pas dans l'application et son contrat n'est pas encore lu : un état dessiné, jamais un écran vide. */
    data object DownloadRequired : ShopPackContents
}

/**
 * La SEULE couture qui dit « que contient ce pack, et comment peindre chacun de ses éléments ». Aujourd'hui le catalogue
 * embarqué ([CatalogShopItemResolver]) ; demain aussi le contrat servi d'un pack téléchargé (#16265), sans que la fiche
 * ni le plein écran ne changent.
 */
fun interface ShopItemResolver {
    suspend fun contents(domain: AppearancePackDomain, slug: String, language: String): ShopPackContents
}

/** Les éléments d'un pack EMBARQUÉ, lus dans le catalogue livré avec l'application. */
object EmbeddedShopContents {

    fun of(catalog: AppearanceCatalog, domain: AppearancePackDomain, slug: String, language: String): ShopPackContents {
        val items = when (domain) {
            AppearancePackDomain.WALLPAPER -> catalog.wallpaperPacks.firstOrNull { it.slug == slug }?.designs?.map { design ->
                ShopItem(domain, slug, design.key, catalog.designName(design.key, language) ?: design.key, ShopItemArt.Wallpaper(design))
            }
            AppearancePackDomain.BANNER -> catalog.bannerPacks.firstOrNull { it.slug == slug }?.designs?.map { design ->
                ShopItem(domain, slug, design.key, catalog.designName(design.key, language) ?: design.key, ShopItemArt.Banner(design))
            }
            AppearancePackDomain.AVATAR_RING -> catalog.ringPacks.firstOrNull { it.slug == slug }?.rings?.map { ring ->
                ShopItem(domain, slug, ring.key, catalog.ringName(ring.key, language) ?: ring.key, ShopItemArt.Ring(ring))
            }
            AppearancePackDomain.BANNER_FRAME -> catalog.bannerFramePacks.firstOrNull { it.slug == slug }?.frames?.map { frame ->
                ShopItem(domain, slug, frame.key, catalog.frameName(frame.key, language) ?: frame.key, ShopItemArt.BannerFrame(frame))
            }
        }
        if (items.isNullOrEmpty()) return ShopPackContents.DownloadRequired
        return ShopPackContents.Ready(items, embedded = true, bytes = items.flatMap { it.art.assets() }.distinctBy { it.sha256 }.sumOf { it.bytes })
    }

    private fun ShopItemArt?.assets(): List<PackAssetRef> = when (this) {
        is ShopItemArt.Ring -> listOfNotNull(design.lottie, design.decor?.back, design.decor?.front)
        is ShopItemArt.Banner -> listOfNotNull(design.lottie)
        is ShopItemArt.BannerFrame -> listOfNotNull(design.lottie)
        is ShopItemArt.Wallpaper -> listOfNotNull(design.lottie)
        null -> emptyList()
    }
}

class CatalogShopItemResolver @Inject constructor(private val loader: AppearanceCatalogLoader) : ShopItemResolver {
    override suspend fun contents(domain: AppearancePackDomain, slug: String, language: String): ShopPackContents =
        EmbeddedShopContents.of(loader.catalog(), domain, slug, language)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ShopItemResolverModule {
    @Binds
    abstract fun bindsShopItemResolver(impl: CatalogShopItemResolver): ShopItemResolver
}
