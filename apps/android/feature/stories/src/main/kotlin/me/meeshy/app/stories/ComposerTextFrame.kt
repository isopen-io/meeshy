package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.GenericShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.scene.StoryTextBackground
import me.meeshy.sdk.model.scene.StoryTextFrame
import me.meeshy.sdk.model.scene.StoryTextFrameShape
import me.meeshy.ui.theme.hexColor

private val Diamond: Shape = GenericShape { size, _ ->
    moveTo(size.width / 2f, 0f)
    lineTo(size.width, size.height / 2f)
    lineTo(size.width / 2f, size.height)
    lineTo(0f, size.height / 2f)
    close()
}

/** Le nuage : un corps plein et une rangée de bosses en haut et en bas — les sous-tracés de même sens s'unissent. */
private val Cloud: Shape = GenericShape { size, _ ->
    val w = size.width
    val h = size.height
    addRoundRect(RoundRect(Rect(w * 0.05f, h * 0.2f, w * 0.95f, h * 0.8f), CornerRadius(h * 0.2f)))
    for (i in 0 until 4) {
        val cx = w * (0.17f + 0.22f * i)
        addOval(Rect(cx - w * 0.17f, 0f, cx + w * 0.17f, h * 0.55f))
        addOval(Rect(cx - w * 0.17f, h * 0.45f, cx + w * 0.17f, h))
    }
}

/** La bulle de BD : un corps arrondi et sa queue vers le bas, à gauche. */
private val Speech: Shape = GenericShape { size, _ ->
    val w = size.width
    val h = size.height
    addRoundRect(RoundRect(Rect(0f, 0f, w, h * 0.82f), CornerRadius(h * 0.2f)))
    moveTo(w * 0.2f, h * 0.78f)
    lineTo(w * 0.1f, h)
    lineTo(w * 0.38f, h * 0.78f)
    close()
}

internal fun StoryTextFrameShape.toComposeShape(): Shape = when (this) {
    StoryTextFrameShape.NONE -> RectangleShape
    StoryTextFrameShape.ROUNDED -> RoundedCornerShape(percent = 15)
    StoryTextFrameShape.PILL -> RoundedCornerShape(percent = 50)
    StoryTextFrameShape.RECTANGLE -> RoundedCornerShape(percent = 4)
    StoryTextFrameShape.DIAMOND -> Diamond
    StoryTextFrameShape.CLOUD -> Cloud
    StoryTextFrameShape.SPEECH -> Speech
}

/** Les formes tracées à la main rognent les coins du texte : la marge s'élargit pour que les lettres restent DEDANS. */
private fun StoryTextFrameShape.paddingBoost(): Float = when (this) {
    StoryTextFrameShape.DIAMOND -> 2.2f
    StoryTextFrameShape.CLOUD -> 1.6f
    StoryTextFrameShape.SPEECH -> 1.2f
    else -> 1f
}

/**
 * La boîte du texte sur la scène (iOS `StoryTextLayer`) : la forme choisie, remplie du fond, cerclée du liseré, avec sa
 * marge. La boîte n'existe que si une forme est choisie ET qu'il y a quelque chose à voir ([StoryTextFrame.hasBox]) ;
 * sans boîte, la marge de repos garde la zone de toucher. Le *choix* est le modèle testé, ceci ne fait que le peindre.
 */
@Composable
internal fun Modifier.composerTextFrame(background: StoryTextBackground, frame: StoryTextFrame, canvasWidthPx: Float): Modifier {
    if (!frame.hasBox(background)) return padding(horizontal = REST_PADDING_H.dp, vertical = REST_PADDING_V.dp)
    val shape = frame.shape.toComposeShape()
    val fill = when (background) {
        StoryTextBackground.None -> Color.Transparent
        is StoryTextBackground.Solid -> hexColor(background.hex, Color.Transparent)
        is StoryTextBackground.Glass -> Color.White.copy(alpha = GLASS_ALPHA)
    }
    val density = LocalDensity.current
    val boxed = background(fill, shape)
    val ringed = if (frame.borderIsVisible) {
        val px = StoryTextMetrics.designPx(frame.borderWidth.toDouble(), 1.0, canvasWidthPx)
        boxed.border(with(density) { px.toDp() }, hexColor(frame.borderColor.orEmpty(), Color.White), shape)
    } else {
        boxed
    }
    val scale = frame.resolvedPaddingScale * frame.shape.paddingBoost()
    return ringed.padding(horizontal = (REST_PADDING_H * scale).dp, vertical = (REST_PADDING_V * scale).dp)
}

private const val REST_PADDING_H = 6f
private const val REST_PADDING_V = 2f
private const val GLASS_ALPHA = 0.18f
