package me.meeshy.sdk.model.appearance

/**
 * Quel fond peindre ? (#10631, spec §§ 5.4, 8.2, 13) — l'orchestration « quel fond, quand », PURE et sans Compose :
 * un fond ne se résout jamais en erreur, ce qui ne se lit pas retombe sur Signature, sans spinner. Miroir de
 * `ConversationBackgroundResolution` (iOS).
 */
sealed interface ConversationBackgroundResolution {
    data object Signature : ConversationBackgroundResolution
    data class Designed(val design: AppearanceDesign) : ConversationBackgroundResolution
    data class Solid(val hex: String) : ConversationBackgroundResolution
    data class Photo(val attachmentId: String, val veil: Double, val blur: Int) : ConversationBackgroundResolution

    companion object {
        /** « Réduire la transparence » force un voile d'au moins 0,6 : le texte des bulles reste lisible sur la photo. */
        const val REDUCED_TRANSPARENCY_VEIL_FLOOR: Double = 0.6

        fun resolve(appearance: ConversationAppearance?, isDark: Boolean, catalog: AppearanceCatalog): ConversationBackgroundResolution {
            val background = appearance?.background ?: return Signature
            return when (background) {
                ConversationBackground.Signature -> Signature
                is ConversationBackground.Design -> when (val found = catalog.wallpaper(background.pack, background.design)) {
                    is WallpaperDesign.Designed -> Designed(found.design)
                    WallpaperDesign.Signature -> Signature
                }
                is ConversationBackground.Solid ->
                    catalog.gamut.surface(background.color, AppearanceScheme.of(isDark))?.let(::Solid) ?: Signature
                is ConversationBackground.Photo -> Photo(background.attachmentId, background.veil, background.blur)
            }
        }

        /** Quand la couche Lottie d'un fond joue : le réglage « Animer » de la conversation, sauf en économie d'énergie. */
        fun animatesLottieLayer(appearance: ConversationAppearance?, lowPower: Boolean): Boolean =
            (appearance?.animate ?: true) && !lowPower

        fun effectiveVeil(veil: Double, reduceTransparency: Boolean): Double =
            if (reduceTransparency) maxOf(veil, REDUCED_TRANSPARENCY_VEIL_FLOOR) else veil

        /** L'accent personnel choisi, dans la teinte du schéma ; `null` pour « Automatique » ou une clé hors gamme. */
        fun personalAccentHex(appearance: ConversationAppearance?, isDark: Boolean, catalog: AppearanceCatalog): String? =
            appearance?.accent?.let { catalog.gamut.accent(it, AppearanceScheme.of(isDark)) }

        /** L'accent qui colore la conversation : le personnel s'il est choisi, sinon l'accent CALCULÉ. */
        fun effectiveAccentHex(appearance: ConversationAppearance?, computedHex: String, isDark: Boolean, catalog: AppearanceCatalog): String =
            personalAccentHex(appearance, isDark, catalog) ?: computedHex
    }
}

/**
 * Les packs de fonds que le sélecteur propose (#10708) : seulement ce que le lecteur POSSÈDE et a INSTALLÉ
 * (`/packs/wallpaper/installed`) ; les dessins `builtin` sont embarqués, le serveur ne dit que QUELS packs sont
 * installés. `installed == null` (pas encore lue, ou panne) : les packs installés d'office.
 */
object WallpaperPackOptions {

    fun packs(installed: List<InstalledPackSummary>?, catalog: AppearanceCatalog): List<AppearanceDesignPack> {
        if (installed == null) return catalog.wallpaperPacks.filter { it.installedByDefault }
        val usable = installed.filter { it.installed && it.isOwned }.mapTo(HashSet()) { it.slug }
        return catalog.wallpaperPacks.filter { it.slug in usable }
    }

    /** Un 404 = « ce serveur ne connaît pas le domaine » ⇒ aucun pack ; toute autre panne ne conclut RIEN (`null`). */
    fun installedFromFailure(httpStatus: Int?): List<InstalledPackSummary>? = if (httpStatus == 404) emptyList() else null
}
