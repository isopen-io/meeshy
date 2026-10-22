package me.meeshy.sdk.model.appearance

/**
 * Ce qu'un couple (pack, modèle) résout, une fois cherché dans le catalogue — jamais
 * « rien » : un modèle inconnu (pack retiré, passerelle plus récente, copie d'un autre
 * appareil) se peint [Signature], le fond de marque, et ne laisse pas un fil sans fond.
 *
 * Miroir de `AppearanceCatalog.wallpaper(pack:design:)` d'iOS, dont le `nil` signifie
 * « ⇒ Signature » : Kotlin rend la décision explicite plutôt que de la laisser à
 * chaque appelant.
 */
sealed interface WallpaperDesign {

    /** Le fond de marque : aucun modèle de pack ne s'applique. */
    data object Signature : WallpaperDesign

    /** Un modèle du catalogue, avec le pack qui le porte. */
    data class Designed(
        val packSlug: String,
        val design: AppearanceDesign,
    ) : WallpaperDesign
}
