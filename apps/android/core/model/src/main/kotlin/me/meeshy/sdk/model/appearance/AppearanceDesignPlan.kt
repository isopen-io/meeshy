package me.meeshy.sdk.model.appearance

import me.meeshy.sdk.model.pack.PackAssetRef

/**
 * Le plan du fond « modèle » (pack, design) derrière le fil : pur, sans Compose. Un modèle inconnu ne se résout
 * jamais en erreur, il rend [Signature] ; un modèle connu se peint depuis le catalogue embarqué, et sa couche Lottie
 * joue seulement si « Animer » est actif, hors économie d'énergie et hors « Réduire les animations ».
 */
sealed interface AppearanceDesignPlan {
    data object Signature : AppearanceDesignPlan

    data class Painted(
        val design: AppearanceDesign,
        val lottie: PackAssetRef?,
        val layerMotion: LayerMotion,
    ) : AppearanceDesignPlan

    enum class LayerMotion { ANIMATED, FIRST_FRAME }

    companion object {
        fun of(
            appearance: ConversationAppearance?,
            isDark: Boolean,
            catalog: AppearanceCatalog,
            lowPower: Boolean,
            reduceMotion: Boolean,
        ): AppearanceDesignPlan {
            val resolved = ConversationBackgroundResolution.resolve(appearance, isDark, catalog)
            val design = (resolved as? ConversationBackgroundResolution.Designed)?.design ?: return Signature
            val plays = ConversationBackgroundResolution.animatesLottieLayer(appearance, lowPower) && !reduceMotion
            return Painted(design, design.lottie, if (plays) LayerMotion.ANIMATED else LayerMotion.FIRST_FRAME)
        }
    }
}
