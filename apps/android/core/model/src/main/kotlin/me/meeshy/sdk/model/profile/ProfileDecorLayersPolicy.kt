package me.meeshy.sdk.model.profile

import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.AvatarRingDesign
import me.meeshy.sdk.model.appearance.BannerFrameDesign
import me.meeshy.sdk.model.appearance.ProfileBannerPaint
import me.meeshy.sdk.model.appearance.ProfileDecorResolver

/**
 * Les couches de décor d'un profil, résolues : le contour de l'avatar, ce que peint la bannière et le cadre posé
 * dessus (miroir de la composition d'`UserProfileSheet+Header` iOS). Le cadre a un centre transparent : il ne capte
 * jamais le doigt ([intercepts] reste faux). Sans contour, sans cadre et sans design, c'est le rendu historique.
 */
data class ProfileDecorLayers(
    val ring: AvatarRingDesign? = null,
    val banner: ProfileBannerPaint = ProfileBannerPaint.Plain,
    val frame: BannerFrameDesign? = null,
) {
    val intercepts: Boolean get() = false

    val isHistoric: Boolean get() = ring == null && frame == null && banner !is ProfileBannerPaint.Design

    companion object {
        val NONE = ProfileDecorLayers()
    }
}

/**
 * La règle partagée de composition du décor : la photo de bannière gagne TOUJOURS sur le design ; le décor est masqué
 * si la cible m'a bloqué (contour, design et cadre ; la photo reste, elle est servie comme avant) ; chaque côté se
 * résout seul — un élément inconnu du catalogue (version plus récente) se tait sans emporter les autres ; sans
 * catalogue (moteur de dessins absent) le rendu historique reste inchangé.
 */
object ProfileDecorLayersPolicy {

    fun resolve(photo: String?, decor: ServedProfileDecor, catalog: AppearanceCatalog?, blockedByTarget: Boolean): ProfileDecorLayers {
        val photoPaint = photo?.takeIf { it.isNotEmpty() }?.let(ProfileBannerPaint::Photo)
        if (catalog == null || blockedByTarget) return ProfileDecorLayers(banner = photoPaint ?: ProfileBannerPaint.Plain)
        return ProfileDecorLayers(
            ring = ProfileDecorResolver.ring(decor.avatarRing, catalog),
            banner = ProfileDecorResolver.bannerPaint(photo, decor.banner, catalog),
            frame = ProfileDecorResolver.bannerFrame(decor.bannerFrame, catalog),
        )
    }
}
