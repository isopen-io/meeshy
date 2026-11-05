package me.meeshy.app.stories

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import me.meeshy.ui.story.canvas.SceneTextFontResolver
import me.meeshy.ui.theme.hexColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import kotlin.math.roundToInt
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.scene.InlineEditLayout
import me.meeshy.sdk.model.scene.InlineEditZone
import me.meeshy.sdk.model.scene.StoryTextDirection
import me.meeshy.ui.haptics.rememberMeeshyHaptics

/**
 * One on-canvas text element: positioned at its normalised ([StoryTextElement.x],
 * [StoryTextElement.y]) of the measured canvas (centred on that point), draggable,
 * tappable to select (#13836) — no frame drawn ([sceneSelection], #14207), written once edited. The
 * normalised→pixel placement and the pixel→normalised drag delta are the only
 * arithmetic here; the clamp lives in [StoryTextElement.nudged]. Pure glue.
 */
@Composable
internal fun TextElementLayer(
    element: StoryTextElement,
    selected: Boolean,
    menu: SceneObjectContextMenu?,
    inlineEditEnabled: Boolean = true,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    onTap: () -> Unit,
    onLongPress: () -> Unit,
    onMenuAction: (me.meeshy.sdk.model.composer.SceneObjectMenu.Action) -> Unit,
    onMenuDismiss: () -> Unit,
    onDrag: (Float, Float) -> Unit,
    onDragEnd: () -> Unit,
    onTransform: (Float, Float) -> Unit,
    onMeasured: (IntSize) -> Unit = {},
    onTextChange: (String) -> Unit = {},
    recentered: Boolean = false,
    editZone: InlineEditZone? = null,
    onInlineEditYield: () -> Unit = {},
) {
    var sizePx by remember { mutableStateOf(IntSize.Zero) }
    val haptics = rememberMeeshyHaptics()
    val currentTap by rememberUpdatedState(onTap)
    val currentLongPress by rememberUpdatedState(onLongPress)
    val currentDrag by rememberUpdatedState(onDrag)
    val currentDragEnd by rememberUpdatedState(onDragEnd)
    val currentTransform by rememberUpdatedState(onTransform)
    val currentScale by rememberUpdatedState(element.scale)
    val currentRotation by rememberUpdatedState(element.rotationDeg)
    val currentRecentered by rememberUpdatedState(recentered)
    val currentYield by rememberUpdatedState(onInlineEditYield)
    val density = LocalDensity.current
    Box(
        modifier = Modifier
            .offset {
                if (recentered) {
                    // Saisie : le texte rejoint la bande libre, droit et à l'échelle d'édition, sans toucher au modèle.
                    val placement = InlineEditLayout.place(editZone, canvasWidthPx, canvasHeightPx, sizePx.height.toFloat())
                    IntOffset(
                        x = (placement.centerX - sizePx.width / 2f).roundToInt(),
                        y = (placement.centerY - sizePx.height / 2f).roundToInt(),
                    )
                } else {
                    IntOffset(
                        x = (element.x * canvasWidthPx - sizePx.width / 2f).roundToInt(),
                        y = (element.y * canvasHeightPx - sizePx.height / 2f).roundToInt(),
                    )
                }
            }
            .graphicsLayer {
                scaleX = if (recentered) 1f else element.scale
                scaleY = if (recentered) 1f else element.scale
                rotationZ = if (recentered) 0f else element.rotationDeg
            }
            .then(
                if (recentered && editZone != null) Modifier.heightIn(max = with(density) { editZone.height.toDp() }) else Modifier,
            )
            .onSizeChanged {
                sizePx = it
                onMeasured(it)
            }
            .sceneObjectGestures(
                key = element.id,
                pose = { if (currentRecentered) SceneObjectPose(1f, 0f) else SceneObjectPose(currentScale, currentRotation) },
                onTap = { currentTap() },
                onLongPress = {
                    haptics.medium()
                    currentLongPress()
                },
                onMove = { pan, zoom, rotation ->
                    // Un geste qui transforme cède la saisie : le texte retrouve sa place réelle et suit le doigt.
                    if (currentRecentered) currentYield()
                    currentDrag(pan.x, pan.y)
                    currentTransform(zoom, rotation)
                },
                onEnd = { currentDragEnd() },
            )
            .semantics {
                onClick { currentTap(); true }
                onLongClick { currentLongPress(); true }
            }
            .sceneSelection(selected)
            .background(
                color = if (selected && menu == null && inlineEditEnabled) Color.Black.copy(alpha = 0.35f) else Color.Transparent,
                shape = RoundedCornerShape(8.dp),
            )
            .padding(horizontal = 8.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        val typography = element.style.typography()
        val textColor = hexColor(element.color, Color.White)
        // The base size in wire design units (1080-referential) mapped onto the REAL scene
        // width — the reader's own law (StoryTextMetrics) — with the element's graphicsLayer
        // `scale` above multiplying on top: iOS `fontSize × scale`, identical on both sides.
        val canvasFontSizePx = element.previewFontPx(canvasWidthPx)
        val canvasFontSize = with(density) { canvasFontSizePx.toSp() }
        // Edited in place while selected (and no context menu is up) — iOS inline editor.
        val editing = selected && menu == null && inlineEditEnabled
        val placeholder = stringResource(R.string.stories_composer_text_placeholder)
        val displayText = element.text.ifBlank { placeholder }
        // Base writing direction is derived from the caption (iOS-parity render-time
        // derivation via the pure StoryTextBidi), so an Arabic/Hebrew caption lays its
        // paragraph out right-to-left. Applied to both the stroked underlay and the fill.
        val textDirection = when (element.baseDirection) {
            StoryTextDirection.LTR -> TextDirection.Ltr
            StoryTextDirection.RTL -> TextDirection.Rtl
        }
        // The EFFECT of the preset (#4870) — the same table as the viewer and the two
        // other clients, projected at the canvas font size. The "neon" preset of this
        // composer carries the glow until it gets its own effect control; it is also
        // what `toTextObject` publishes, so what the author sees is what leaves.
        val baseStyle = LocalTextStyle.current.copy(
            shadow = element.style.presetEffect().composeShadow(canvasFontSizePx, textColor),
            textDirection = textDirection,
        )
        FramedTextBox(
            background = element.background,
            frame = element.frame,
            pxPerDesign = StoryTextMetrics.pxPerDesign(1.0, canvasWidthPx),
            glyphStyle = TextStyle(
                fontSize = canvasFontSize,
                fontWeight = FontWeight(typography.fontWeight),
                fontStyle = if (typography.italic) FontStyle.Italic else FontStyle.Normal,
                fontFamily = SceneTextFontResolver.familyOf(typography.face),
                letterSpacing = typography.letterSpacingEm.em,
            ),
        ) {
            val outline = element.outline
            if (outline.isVisible && !editing) {
                // Stroked underlay: the same glyphs painted as an outline beneath the fill,
                // so the border hugs the letterforms rather than boxing the element.
                Text(
                    text = displayText,
                    color = hexColor(outline.color!!, Color.White),
                    fontSize = canvasFontSize,
                    fontWeight = FontWeight(typography.fontWeight),
                    fontStyle = if (typography.italic) FontStyle.Italic else FontStyle.Normal,
                    fontFamily = SceneTextFontResolver.familyOf(typography.face),
                    letterSpacing = typography.letterSpacingEm.em,
                    textAlign = element.align.toTextAlign(),
                    style = baseStyle.copy(drawStyle = Stroke(width = element.previewOutlinePx(canvasWidthPx))),
                )
            }
            if (editing) {
                ComposerInlineTextField(
                    elementId = element.id,
                    text = element.text,
                    placeholder = placeholder,
                    style = baseStyle.copy(
                        color = textColor,
                        fontSize = canvasFontSize,
                        fontWeight = FontWeight(typography.fontWeight),
                        fontStyle = if (typography.italic) FontStyle.Italic else FontStyle.Normal,
                        fontFamily = SceneTextFontResolver.familyOf(typography.face),
                        letterSpacing = typography.letterSpacingEm.em,
                        textAlign = element.align.toTextAlign(),
                    ),
                    onTextChange = onTextChange,
                    outlineStyle = if (outline.isVisible) {
                        baseStyle.copy(
                            color = hexColor(outline.color.orEmpty(), Color.White),
                            fontSize = canvasFontSize,
                            fontWeight = FontWeight(typography.fontWeight),
                            fontStyle = if (typography.italic) FontStyle.Italic else FontStyle.Normal,
                            fontFamily = SceneTextFontResolver.familyOf(typography.face),
                            letterSpacing = typography.letterSpacingEm.em,
                            textAlign = element.align.toTextAlign(),
                            drawStyle = Stroke(width = element.previewOutlinePx(canvasWidthPx)),
                        )
                    } else {
                        null
                    },
                )
            } else {
                Text(
                    text = displayText,
                    color = textColor,
                    fontSize = canvasFontSize,
                    fontWeight = FontWeight(typography.fontWeight),
                    fontStyle = if (typography.italic) FontStyle.Italic else FontStyle.Normal,
                    fontFamily = SceneTextFontResolver.familyOf(typography.face),
                    letterSpacing = typography.letterSpacingEm.em,
                    textAlign = element.align.toTextAlign(),
                    style = baseStyle,
                )
            }
        }
        SceneObjectMenuPopup(menu = menu, onAction = onMenuAction, onDismiss = onMenuDismiss)
    }
}

internal fun StoryTextAlign.toTextAlign(): TextAlign = when (this) {
    StoryTextAlign.LEFT -> TextAlign.Start
    StoryTextAlign.CENTER -> TextAlign.Center
    StoryTextAlign.RIGHT -> TextAlign.End
}

internal fun StoryTextFontFamily.toFontFamily(): FontFamily = when (this) {
    StoryTextFontFamily.SANS -> FontFamily.SansSerif
    StoryTextFontFamily.SERIF -> FontFamily.Serif
    StoryTextFontFamily.MONOSPACE -> FontFamily.Monospace
    StoryTextFontFamily.CURSIVE -> FontFamily.Cursive
}
