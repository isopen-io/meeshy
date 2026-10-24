package me.meeshy.ui.appearance

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import me.meeshy.sdk.model.appearance.BannerFrameDesign
import me.meeshy.ui.accessibility.LocalReduceMotion

/**
 * Le cadre de bannière (miroir de `BannerFrameView.swift`) posé PAR-DESSUS la photo ou le fond, qu'il ne
 * remplace jamais : le dessin fixe est rasterisé UNE fois par taille (sous la découpe : centre transparent),
 * les mouvements sont des couches animées sur transform et opacité ([FrameMotionLayers]), la couche Lottie
 * facultative est découpée à la région du cadre. Décoratif : ni le doigt ni TalkBack ne s'y arrêtent.
 * [animates] faux (aperçu, vignette) ou « Réduire les animations » ⇒ le cadre fixe.
 */
@Composable
public fun BannerFrameView(
    design: BannerFrameDesign,
    modifier: Modifier = Modifier,
    animates: Boolean = true,
    lottieLayer: BannerLottieLayer? = null,
) {
    var size by remember { mutableStateOf(IntSize.Zero) }
    val direction = LocalLayoutDirection.current
    val playing = animates && !LocalReduceMotion.current
    Box(modifier.onSizeChanged { size = it }.clearAndSetSemantics { }) {
        if (size.width <= 0 || size.height <= 0) return@Box
        val mirrored = direction == LayoutDirection.Rtl
        val scene = remember(design, size, mirrored) { BannerFrameScene.make(design, size.width, size.height, mirrored) }
        Spacer(
            Modifier.fillMaxSize().drawWithCache {
                val still = scene.rasterize(this, direction)
                onDrawBehind { drawImage(still) }
            },
        )
        if (!scene.plan.isStill) {
            Box(Modifier.fillMaxSize().clippedTo(scene)) {
                FrameMotionLayers(
                    plan = scene.plan,
                    viewBoxWidth = scene.logicalWidth.toFloat(),
                    viewBoxHeight = BannerFrameDesign.HEIGHT.toFloat(),
                    drawElements = { indices -> with(scene) { drawElements(indices) } },
                    modifier = Modifier.fillMaxSize(),
                    animates = animates,
                )
            }
        }
        val lottie = design.lottie
        if (lottie != null && lottieLayer != null) {
            Box(Modifier.fillMaxSize().clippedTo(scene)) { lottieLayer(lottie, playing) }
        }
    }
}

private fun Modifier.clippedTo(scene: BannerFrameScene): Modifier = drawWithContent {
    clipPath(scene.clipPx) { this@drawWithContent.drawContent() }
}
