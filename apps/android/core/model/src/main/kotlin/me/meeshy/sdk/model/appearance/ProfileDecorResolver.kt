package me.meeshy.sdk.model.appearance

import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.ServedProfileDecorItem

/** Ce qu'une bannière de profil peint : sa photo, sinon le design équipé, sinon le dégradé par défaut. */
sealed interface ProfileBannerPaint {
    data class Photo(val url: String) : ProfileBannerPaint
    data class Design(val design: AppearanceDesign) : ProfileBannerPaint
    data object Plain : ProfileBannerPaint
}

/**
 * Résolution du dessin d'un décor servi — miroir de `ProfileDecorResolver` (iOS) : un `builtin` se
 * lit dans le catalogue EMBARQUÉ, sans réseau. Un modèle adressé par contrat (`<sha16>.json`) n'est
 * pas embarqué : `null`, et le profil se peint sans décor — jamais en erreur.
 */
object ProfileDecorResolver {

    fun ring(item: ServedProfileDecorItem?, catalog: AppearanceCatalog): AvatarRingDesign? =
        item?.takeIf(::isEmbedded)?.let { catalog.ring(it.pack, it.item) }

    fun banner(item: ServedProfileDecorItem?, catalog: AppearanceCatalog): AppearanceDesign? =
        item?.takeIf(::isEmbedded)?.let { catalog.bannerDesign(it.pack, it.item) }

    fun bannerFrame(item: ServedProfileDecorItem?, catalog: AppearanceCatalog): BannerFrameDesign? =
        item?.takeIf(::isEmbedded)?.let { catalog.bannerFrame(it.pack, it.item) }

    /** La photo gagne TOUJOURS ; le design équipé ne se peint qu'en son absence. */
    fun bannerPaint(photo: String?, decor: ServedProfileDecorItem?, catalog: AppearanceCatalog): ProfileBannerPaint {
        if (!photo.isNullOrEmpty()) return ProfileBannerPaint.Photo(photo)
        return banner(decor, catalog)?.let(ProfileBannerPaint::Design) ?: ProfileBannerPaint.Plain
    }

    private fun isEmbedded(item: ServedProfileDecorItem): Boolean =
        item.origin == PackOrigin.BUILTIN || item.contract == null
}
