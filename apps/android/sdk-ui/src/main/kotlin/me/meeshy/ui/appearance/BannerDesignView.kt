package me.meeshy.ui.appearance

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.layout.ContentScale
import me.meeshy.sdk.model.appearance.AppearanceDesign
import me.meeshy.sdk.model.appearance.BannerSourceResolver
import me.meeshy.sdk.model.pack.PackAssetRef
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.lottie.PackLottieLayer

/**
 * La couche animée d'un design : le film du pack [ref], joué à plein cadre. [animates] faux ⇒ la couche montre sa
 * première image (aperçus, économie d'énergie, « Réduire les animations »). Par défaut [PackBannerLottieLayer], qui lit
 * le film par la source que l'app fournit ; sans source, la couche s'efface et le dessin vectoriel reste la vérité.
 */
public typealias BannerLottieLayer = @Composable (ref: PackAssetRef, animates: Boolean) -> Unit

/** La couche d'une bannière (#13952, miroir de `PackLottieLayer(contentMode: .fill)` d'iOS) : le film rogné à plein cadre. */
public val PackBannerLottieLayer: BannerLottieLayer = { ref, animates ->
    PackLottieLayer(ref, Modifier.fillMaxSize(), animates = animates, contentScale = ContentScale.Crop)
}

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
    lottieLayer: BannerLottieLayer? = PackBannerLottieLayer,
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
