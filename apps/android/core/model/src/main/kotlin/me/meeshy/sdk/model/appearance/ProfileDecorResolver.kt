package me.meeshy.sdk.model.appearance

import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem

/** Ce qu'une bannière de profil peint : sa photo, sinon le design équipé, sinon le dégradé par défaut. */
sealed interface ProfileBannerPaint {
    data class Photo(val url: String) : ProfileBannerPaint
    data class Design(val design: AppearanceDesign) : ProfileBannerPaint
    data object Plain : ProfileBannerPaint
}

/**
 * Résolution du dessin d'un décor servi — miroir de `ProfileDecorResolver` (iOS) : un `builtin` se lit dans le catalogue
 * EMBARQUÉ, sans réseau. Un modèle adressé par contrat (`<sha16>.json`, #16265) se lit dans le contrat chargé à CETTE
 * adresse — jamais dans un pack du même slug, dont la version peut différer. Tant que ce contrat n'est pas chargé : `null`,
 * et le profil se peint sans décor — jamais en erreur.
 */
object ProfileDecorResolver {

    fun ring(item: ServedProfileDecorItem?, catalog: AppearanceCatalog): AvatarRingDesign? =
        item?.let { resolve(it, { catalog.ring(it.pack, it.item) }) { src -> catalog.servedRing(src, it.item) } }

    fun banner(item: ServedProfileDecorItem?, catalog: AppearanceCatalog): AppearanceDesign? =
        item?.let { resolve(it, { catalog.bannerDesign(it.pack, it.item) }) { src -> catalog.servedBannerDesign(src, it.item) } }

    fun bannerFrame(item: ServedProfileDecorItem?, catalog: AppearanceCatalog): BannerFrameDesign? =
        item?.let { resolve(it, { catalog.bannerFrame(it.pack, it.item) }) { src -> catalog.servedBannerFrame(src, it.item) } }

    /** La photo gagne TOUJOURS ; le design équipé ne se peint qu'en son absence. */
    fun bannerPaint(photo: String?, decor: ServedProfileDecorItem?, catalog: AppearanceCatalog): ProfileBannerPaint {
        if (!photo.isNullOrEmpty()) return ProfileBannerPaint.Photo(photo)
        return banner(decor, catalog)?.let(ProfileBannerPaint::Design) ?: ProfileBannerPaint.Plain
    }

    /** Les adresses de contrat que [decor] demande et que [catalog] ne résout pas encore : celles à télécharger. */
    fun missingContracts(decor: ServedProfileDecor, catalog: AppearanceCatalog): Set<String> = buildSet {
        if (ring(decor.avatarRing, catalog) == null) decor.avatarRing.contractToLoad()?.let(::add)
        if (banner(decor.banner, catalog) == null) decor.banner.contractToLoad()?.let(::add)
        if (bannerFrame(decor.bannerFrame, catalog) == null) decor.bannerFrame.contractToLoad()?.let(::add)
    }

    private fun ServedProfileDecorItem?.contractToLoad(): String? =
        this?.takeUnless(::isEmbedded)?.contract?.takeIf(ServedAppearanceContract::isAddress)

    private inline fun <D> resolve(item: ServedProfileDecorItem, embedded: () -> D?, served: (String) -> D?): D? {
        if (isEmbedded(item)) return embedded()
        return item.contract?.let(served)
    }

    private fun isEmbedded(item: ServedProfileDecorItem): Boolean =
        item.origin == PackOrigin.BUILTIN || item.contract == null
}
