package me.meeshy.ui.story.canvas

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.em
import me.meeshy.sdk.model.StoryTextEffect
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.scene.CanvasGeometry
import me.meeshy.sdk.model.scene.MeeshySceneObject
import me.meeshy.sdk.model.scene.StoryTextBackground
import me.meeshy.sdk.model.scene.StoryTextBidi
import me.meeshy.sdk.model.scene.StoryTextDirection
import me.meeshy.sdk.model.scene.StoryTextFrame
import me.meeshy.sdk.model.scene.StoryTextOutline
import me.meeshy.ui.theme.hexColor

internal const val SCENE_TEXT_TAG: String = "scene-text"

/**
 * Un texte : le texte SERVI par le plan (Prisme), à sa pose. Il se lit avec son style (l'un des dix-huit), son poids
 * d'auteur, son contour, son effet d'ombre ou de lueur, son cadre et le sens de lecture de son contenu. La taille rendue
 * est `fontSize × échelle × largeur / 1080` : une tuile et un plein écran gardent les mêmes proportions.
 */
@Composable
internal fun SceneTextLayer(node: SceneNode, modifier: Modifier = Modifier) {
    val text = (node.item.source as? MeeshySceneObject.Text)?.value ?: return
    val shown = node.item.displayText?.takeIf { it.isNotEmpty() } ?: return
    val pose = node.item.pose
    BoxWithConstraints(modifier.fillMaxSize()) {
        val density = LocalDensity.current
        val widthPx = with(density) { maxWidth.toPx() }
        val pxPerDesign = (pose.scale * CanvasGeometry.scaleFactor(widthPx.toDouble())).toFloat()
        val fontPx = (text.fontSize * pxPerDesign).toFloat()
        var measured by remember { mutableStateOf(IntSize.Zero) }
        Box(
            Modifier
                .wrapContentSize(Alignment.TopStart, unbounded = true)
                .offset(
                    x = maxWidth * pose.x.toFloat() - with(density) { (measured.width / 2f).toDp() },
                    y = maxHeight * pose.y.toFloat() - with(density) { (measured.height / 2f).toDp() },
                )
                .onSizeChanged { measured = it }
                .graphicsLayer { rotationZ = pose.rotation.toFloat() }
                .alpha(pose.opacity.toFloat().coerceIn(0f, 1f))
                .testTag(SCENE_TEXT_TAG),
        ) {
            SceneStyledText(text = text, shown = shown, fontPx = fontPx, pxPerDesign = pxPerDesign)
        }
    }
}

@Composable
private fun SceneStyledText(text: StoryTextObject, shown: String, fontPx: Float, pxPerDesign: Float) {
    val font = SceneTextFontResolver.resolve(text.textStyle, text.fontWeight)
    val color = text.textColor?.let { hexColor(it, Color.White) } ?: Color.White
    val fontSize = with(LocalDensity.current) { fontPx.toSp() }
    val outlineWidth = text.borderWidth?.toFloat()?.takeIf { it.isFinite() && it > StoryTextOutline.NONE_WIDTH }
    val outlineColor = outlineWidth?.let { text.borderColor?.let { hex -> hexColor(hex, Color.White) } ?: Color.White }
    val base = LocalTextStyle.current.copy(
        fontSize = fontSize,
        fontFamily = font.family,
        fontWeight = font.weight,
        fontStyle = font.style,
        letterSpacing = font.letterSpacingEm.em,
        textAlign = text.textAlign.toTextAlign(),
        textDirection = when (StoryTextBidi.resolveBaseDirection(shown)) {
            StoryTextDirection.LTR -> TextDirection.Ltr
            StoryTextDirection.RTL -> TextDirection.Rtl
        },
        shadow = StoryTextEffect.fromWire(text.textEffect).toComposeShadow(fontPx, color),
    )
    SceneTextFrameBox(
        background = StoryTextBackground.resolve(text.backgroundStyle, text.textBg),
        frame = StoryTextFrame.fromWire(text.frameShape, text.framePaddingScale, text.frameBorderWidth, text.frameBorderColor),
        pxPerDesign = pxPerDesign,
        glyphStyle = TextStyle(fontSize = fontSize, fontFamily = font.family, fontWeight = font.weight, fontStyle = font.style),
        inkText = shown,
        inkStyle = base.copy(shadow = null),
    ) {
        if (outlineWidth != null && outlineColor != null) {
            Text(
                text = shown,
                color = outlineColor,
                style = base.copy(shadow = null, drawStyle = Stroke(width = outlineWidth * pxPerDesign)),
            )
        }
        Text(text = shown, color = color, style = base)
    }
}

private fun String?.toTextAlign(): TextAlign = when (this) {
    "left" -> TextAlign.Left
    "right" -> TextAlign.Right
    else -> TextAlign.Center
}
