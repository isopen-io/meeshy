package me.meeshy.sdk.model.appearance

/** Ce qui peint la bannière d'un profil : le design (3:1) PRIME sur la photo, la photo sur rien. */
sealed interface BannerSource {
    data class Design(val design: AppearanceDesign) : BannerSource
    data class Photo(val url: String) : BannerSource
    data object None : BannerSource
}

object BannerSourceResolver {

    /** Rapport largeur/hauteur d'une bannière de design. */
    const val ASPECT_RATIO = 3f

    fun resolve(design: AppearanceDesign?, photoUrl: String?): BannerSource = when {
        design != null -> BannerSource.Design(design)
        !photoUrl.isNullOrBlank() -> BannerSource.Photo(photoUrl)
        else -> BannerSource.None
    }
}
