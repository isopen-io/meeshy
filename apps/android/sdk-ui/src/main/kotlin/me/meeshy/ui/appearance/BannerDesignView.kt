package me.meeshy.ui.appearance

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import me.meeshy.sdk.model.appearance.AppearanceDesign
import me.meeshy.sdk.model.appearance.BannerSourceResolver
import me.meeshy.sdk.model.pack.PackAssetRef
import me.meeshy.ui.accessibility.LocalReduceMotion

/**
 * La couche animée d'un design : le film du pack [ref], joué à plein cadre. [animates] faux ⇒ la couche montre sa
 * première image (aperçus, économie d'énergie, « Réduire les animations »). Fournie par l'app, qui sait résoudre
 * les fichiers du pack ; absente tant que le moteur de packs n'est pas branché, le dessin vectoriel reste la vérité.
 */
public typealias BannerLottieLayer = @Composable (ref: PackAssetRef, animates: Boolean) -> Unit

/**
 * Une bannière de design 3:1 (spec §§ 5.3, 8.2) : elle PRIME sur l'image de bannière d'un profil. La même donnée
 * vectorielle que les fonds, peinte par le même moteur ([AppearanceDesignView]), sans second moteur de dessin.
 * La couche animée est en SURIMPRESSION : le design seul fixe la taille, le film est rogné, jamais la mise en page.
 */
@Composable
public fun BannerDesignView(
    design: AppearanceDesign,
    isDark: Boolean,
    accentHex: String,
    modifier: Modifier = Modifier,
    animates: Boolean = true,
    lottieLayer: BannerLottieLayer? = null,
) {
    val lottie = design.lottie
    val playing = animates && !LocalReduceMotion.current
    Box(modifier = modifier.aspectRatio(BannerSourceResolver.ASPECT_RATIO).clipToBounds()) {
        AppearanceDesignView(design = design, isDark = isDark, accentHex = accentHex, modifier = Modifier.matchParentSize())
        if (lottie != null && lottieLayer != null) {
            Box(Modifier.matchParentSize().clipToBounds()) { lottieLayer(lottie, playing) }
        }
    }
}
