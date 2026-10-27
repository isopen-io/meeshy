package me.meeshy.ui.component.capture

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.animation.core.animateFloat
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FlashAuto
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.FlipCameraAndroid
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.Undo
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.composer.capture.CaptureFlash
import me.meeshy.sdk.model.composer.capture.CaptureFlashMode
import me.meeshy.sdk.model.composer.capture.CaptureLockSeal
import me.meeshy.sdk.model.composer.capture.CaptureZoomBarMorph
import me.meeshy.sdk.model.composer.capture.CaptureTopRow
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyControlSize

private val Glass = Color.Black.copy(alpha = 0.38f)
private val ChromeWhite = Color.White

/** Un bouton rond de la rangée haute : cible de 44 dp, voile sombre qui reste lisible sur n'importe quel flux. */
@Composable
internal fun CaptureRoundButton(icon: ImageVector, label: String, onClick: () -> Unit, modifier: Modifier = Modifier, tint: Color = ChromeWhite) {
    Box(
        modifier = modifier
            .size(MeeshyControlSize.minTouchTarget)
            .clip(CircleShape)
            .background(Glass)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
    }
}

@Composable
internal fun CaptureFlashButton(mode: CaptureFlashMode, onClick: () -> Unit) {
    val icon = when (mode) {
        CaptureFlashMode.ON -> Icons.Filled.FlashOn
        CaptureFlashMode.AUTO -> Icons.Filled.FlashAuto
        CaptureFlashMode.OFF -> Icons.Filled.FlashOff
    }
    val label = stringResource(
        when (mode) {
            CaptureFlashMode.ON -> R.string.capture_flash_on
            CaptureFlashMode.AUTO -> R.string.capture_flash_auto
            CaptureFlashMode.OFF -> R.string.capture_flash_off
        },
    )
    CaptureRoundButton(icon, label, onClick, tint = if (mode == CaptureFlashMode.OFF) ChromeWhite else Color(0xFFFFD60A))
}

@Composable
internal fun CaptureTopItem(
    item: CaptureTopRow.Item,
    flash: CaptureFlashMode,
    actions: CaptureViewfinderActions,
) {
    when (item) {
        CaptureTopRow.Item.CLOSE -> CaptureRoundButton(Icons.Filled.Close, stringResource(R.string.capture_disarm), actions.onClose)
        CaptureTopRow.Item.FLASH -> CaptureFlashButton(flash, actions.onFlash)
        CaptureTopRow.Item.FLIP -> CaptureRoundButton(Icons.Filled.FlipCameraAndroid, stringResource(R.string.capture_flip), actions.onFlip)
        CaptureTopRow.Item.DROP_SEGMENT -> CaptureRoundButton(Icons.Filled.Undo, stringResource(R.string.capture_drop_segment), actions.onDropSegment)
        CaptureTopRow.Item.VALIDATE ->
            CaptureRoundButton(Icons.Filled.Check, stringResource(R.string.capture_validate), actions.onValidate, tint = MeeshyPalette.Success)
        CaptureTopRow.Item.CHRONO, CaptureTopRow.Item.SIZE, CaptureTopRow.Item.SAVE, CaptureTopRow.Item.DONE -> Unit
    }
}

/** La puce du chrono : point rouge, durée de la prise comprise, et « 3 – » quand des segments existent. */
@Composable
internal fun CaptureChronoChip(elapsedSec: () -> Double, segmentCount: Int, recording: Boolean) {
    val total = elapsedSec().toLong().coerceAtLeast(0)
    val text = "%d:%02d".format(total / 60, total % 60)
    val a11y = pluralStringResource(R.plurals.capture_segments, segmentCount, segmentCount)
    Row(
        modifier = Modifier
            .height(MeeshyControlSize.minTouchTarget)
            .clip(RoundedCornerShape(22.dp))
            .background(Glass)
            .padding(horizontal = 12.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = "$text, $a11y"
                stateDescription = a11y
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(9.dp).clip(CircleShape).background(if (recording) MeeshyPalette.Error else Color.White.copy(alpha = 0.6f)))
        Text(text, color = ChromeWhite, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        if (segmentCount > 0) {
            Text(CaptureTopRow.segmentBadge(segmentCount), color = ChromeWhite.copy(alpha = 0.85f), fontSize = 13.sp)
        }
    }
}

/** Le curseur vertical d'intensité du flash : en haut le plein, en bas le plancher ; un élément réglable pour TalkBack. */
@Composable
internal fun CaptureFlashIntensitySlider(
    level: Double,
    onChange: (Double) -> Unit,
    onHold: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val trackHeight = 132.dp
    val thumb = 18.dp
    val density = LocalDensity.current
    val trackPx = with(density) { trackHeight.toPx() }
    val position = CaptureFlash.thumbPosition(level)
    val course = trackHeight - thumb
    val label = stringResource(R.string.capture_flash_intensity)
    Column(
        modifier = modifier
            .width(MeeshyControlSize.minTouchTarget)
            .clip(RoundedCornerShape(22.dp))
            .background(Glass)
            .padding(vertical = 8.dp)
            .semantics {
                contentDescription = label
                stateDescription = "${CaptureFlash.percent(level)}%"
                role = Role.Button
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(Icons.Filled.WbSunny, contentDescription = null, tint = Color(0xFFFFD60A), modifier = Modifier.size(16.dp))
        Box(
            modifier = Modifier
                .width(MeeshyControlSize.minTouchTarget)
                .height(trackHeight)
                .pointerInput(Unit) {
                    detectTapGestures(
                        onPress = { offset ->
                            onHold(true)
                            onChange(CaptureFlash.level(offset.y, trackPx))
                            tryAwaitRelease()
                            onHold(false)
                        },
                    )
                }
                .pointerInput(Unit) {
                    detectVerticalDragGestures(
                        onDragStart = { onHold(true) },
                        onDragEnd = { onHold(false) },
                        onDragCancel = { onHold(false) },
                        onVerticalDrag = { change, _ -> onChange(CaptureFlash.level(change.position.y, trackPx)) },
                    )
                },
            contentAlignment = Alignment.TopCenter,
        ) {
            Box(Modifier.width(4.dp).height(trackHeight).clip(CircleShape).background(Color.White.copy(alpha = 0.28f)))
            Box(
                Modifier
                    .width(4.dp)
                    .height(trackHeight - course * position - thumb / 2)
                    .align(Alignment.BottomCenter)
                    .clip(CircleShape)
                    .background(Color(0xFFFFD60A)),
            )
            Box(Modifier.offset(y = course * position).size(thumb).clip(CircleShape).background(Color.White))
        }
    }
}

/** La clé du verrou : paraît dès que le doigt tient, se remplit pendant le glissé, se scelle avec un rebond élastique. */
@Composable
internal fun CaptureLockTrack(progress: Float, sealed: Boolean, reduceMotion: Boolean, modifier: Modifier = Modifier) {
    val scale by animateFloatAsState(
        targetValue = CaptureLockSeal.glyphScale(progress, sealed, reduceMotion),
        animationSpec = if (reduceMotion) tween(150) else spring(dampingRatio = 0.38f, stiffness = Spring.StiffnessMedium),
        label = "lock-scale",
    )
    val edge = if (sealed) MeeshyPalette.Success else Color.White.copy(alpha = 0.3f + 0.5f * progress)
    Row(
        modifier = modifier
            .height(MeeshyControlSize.minTouchTarget)
            .clip(CircleShape)
            .background(Glass)
            .border(2.dp, edge, CircleShape)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Color.White.copy(alpha = 0.45f + 0.55f * progress), modifier = Modifier.size(16.dp))
        Icon(
            if (sealed || progress >= 1f) Icons.Filled.Lock else Icons.Filled.LockOpen,
            contentDescription = null,
            tint = if (sealed) MeeshyPalette.Success else Color.White,
            modifier = Modifier.size(20.dp).scale(scale),
        )
    }
}

/** Les crans de zoom de l'objectif ; pendant la bascule, ils se resserrent en une capsule où tourne le glyphe. */
@Composable
internal fun CaptureZoomBar(
    factor: Float,
    presets: List<Float>,
    switching: Boolean,
    reduceMotion: Boolean,
    onSelect: (Float) -> Unit,
    onStep: (Boolean) -> Unit,
) {
    val phase = CaptureZoomBarMorph.phase(switching, presets, factor)
    AnimatedContent(
        targetState = phase,
        transitionSpec = {
            if (reduceMotion) fadeIn(tween(150)) togetherWith fadeOut(tween(150))
            else (scaleIn(spring(0.72f, 380f), initialScale = 0.6f) + fadeIn()) togetherWith (scaleOut(targetScale = 0.6f) + fadeOut())
        },
        label = "zoom-bar-morph",
    ) { shown ->
        when (shown) {
            CaptureZoomBarMorph.Phase.Hidden -> Box(Modifier.height(MeeshyControlSize.minTouchTarget))
            is CaptureZoomBarMorph.Phase.Presets -> ZoomPresets(factor, shown.presets, onSelect)
            CaptureZoomBarMorph.Phase.Chip -> ZoomChip(factor, onStep)
            CaptureZoomBarMorph.Phase.Morphing -> ZoomMorphPill()
        }
    }
}

private fun formatZoom(f: Float): String = if (f % 1f == 0f) "${f.toInt()}×" else "%.1f×".format(f)

@Composable
private fun ZoomPresets(factor: Float, presets: List<Float>, onSelect: (Float) -> Unit) {
    val selected = presets.minByOrNull { kotlin.math.abs(it - factor) }
    Row(
        Modifier.clip(CircleShape).background(Glass).padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        presets.forEach { preset ->
            val on = preset == selected && kotlin.math.abs(preset - factor) < 0.05f
            Box(
                Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(if (on) Color.White.copy(alpha = 0.25f) else Color.Transparent)
                    .clickable(role = Role.Button, onClickLabel = stringResource(R.string.capture_zoom_reset, formatZoom(preset))) { onSelect(preset) },
                contentAlignment = Alignment.Center,
            ) {
                Text(if (on) formatZoom(factor) else formatZoom(preset), color = if (on) Color(0xFFFFD60A) else Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun ZoomChip(factor: Float, onStep: (Boolean) -> Unit) {
    Row(
        Modifier.height(36.dp).clip(CircleShape).background(Glass).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("−", color = Color.White, fontSize = 18.sp, modifier = Modifier.clickable { onStep(false) })
        Text(formatZoom(factor), color = Color(0xFFFFD60A), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Text("+", color = Color.White, fontSize = 18.sp, modifier = Modifier.clickable { onStep(true) })
    }
}

@Composable
private fun ZoomMorphPill() {
    val turns by androidx.compose.animation.core.rememberInfiniteTransition(label = "flip-turn").animateFloat(
        initialValue = 0f,
        targetValue = 180f,
        animationSpec = androidx.compose.animation.core.infiniteRepeatable(tween(450, easing = androidx.compose.animation.core.FastOutSlowInEasing)),
        label = "flip-turn-angle",
    )
    Box(
        Modifier.width(MeeshyControlSize.minTouchTarget + 12.dp).height(MeeshyControlSize.minTouchTarget).clip(CircleShape).background(Glass),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.Filled.FlipCameraAndroid,
            contentDescription = stringResource(R.string.capture_flip),
            tint = Color.White,
            modifier = Modifier.size(20.dp).graphicsLayer { rotationZ = turns },
        )
    }
}
