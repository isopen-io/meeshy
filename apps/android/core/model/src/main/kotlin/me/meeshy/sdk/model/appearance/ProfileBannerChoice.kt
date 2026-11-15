package me.meeshy.sdk.model.appearance

import me.meeshy.sdk.model.ProfileDecorRef

/**
 * La rangée « Bannière » du sélecteur de décor — miroir de `ProfileBannerChoice` (iOS) : la photo gagne toujours sur
 * les fonds, donc la tuile « Image » est le choix visible dès qu'une photo existe, et aucun fond n'est montré choisi.
 */
data class ProfileBannerChoice(val photo: String?, val design: ProfileDecorRef?) {

    private val hasPhoto: Boolean get() = !photo.isNullOrEmpty()

    /** La bannière actuelle que la tuile « Image » montre ; `null` ⇒ un glyphe. */
    val imagePreview: String? get() = if (hasPhoto) photo else null

    val imageSelected: Boolean get() = hasPhoto || design == null

    val photoHidesDesigns: Boolean get() = hasPhoto

    fun isSelected(ref: ProfileDecorRef): Boolean = !hasPhoto && design == ref
}
