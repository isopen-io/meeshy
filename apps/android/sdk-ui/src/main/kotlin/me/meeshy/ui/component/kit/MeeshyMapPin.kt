package me.meeshy.ui.component.kit

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val BREATH_MILLIS = 5000
private const val BREATH_SCALE = 1.05f
private const val PULSE_START = 0.7f
private const val PULSE_SPAN = 1.6f
private const val DISC_BORDER_DP = 1.5f
private const val POINT_RADIUS_DP = 3
private const val SELECT_RING_DP = 3
private const val RING_GAP_DP = 5

/**
 * **L'épingle de personne** (K36) : un contenu rond (avatar, vignette, glyphe) sous un liseré qui le détache de n'importe
 * quel fond de carte, avec son disque de flou et son onde. La précision change ce qu'il y a AUTOUR de l'épingle, jamais
 * l'épingle elle-même. Elle ne connaît ni la carte, ni les coordonnées, ni la personne : le rayon arrive déjà mesuré en dp,
 * l'hôte pose l'avatar dans [content] et le point de présence dans [badge].
 *
 * Un seul élément pour la voix ([label]) ; la zone de toucher fait 44 dp au moins, même pour une épingle de 38 ; le disque ne
 * se touche pas. Sous mouvement réduit l'onde reste un anneau fixe. Jumeau iOS : `MeeshyMapPin`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyMapPin(
    label: String,
    modifier: Modifier = Modifier,
    tint: Color = MeeshyPalette.Indigo500,
    kind: MeeshyMapPinKind = MeeshyMapPinKind.Other,
    precision: MeeshyMapPinPrecision = MeeshyMapPinPrecision.Exact,
    isLive: Boolean = false,
    isSelected: Boolean = false,
    isStale: Boolean = false,
    caption: String? = null,
    onPress: (() -> Unit)? = null,
    badge: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val reduce = LocalReduceMotion.current
    val tokens = MeeshyTheme.tokens
    val source = remember { MutableInteractionSource() }
    val isPressed by source.collectIsPressedAsState()
    val values = MeeshyMapPinRecipe.resolve(kind, precision, isLive, isSelected, isStale, isPressed, reduce)
    val press by animateFloatAsState(values.pressScale, label = "pin-press")
    val pulse = if (values.pulseAnimates) {
        rememberInfiniteTransition(label = "pin-pulse").animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(MeeshyMapPinRecipe.PULSE_MILLIS, easing = LinearEasing)),
            label = "pin-pulse-progress",
        )
    } else {
        null
    }
    val discTint = if (isStale) tokens.textMuted else tint
    val linerColor = if (values.isForeground || kind == MeeshyMapPinKind.Own) Color.White else tokens.backgroundPrimary
    val tap = if (onPress != null) {
        Modifier.clickable(interactionSource = source, indication = null, role = Role.Button, onClick = onPress)
    } else {
        Modifier
    }
    Column(
        modifier
            .graphicsLayer { scaleX = press; scaleY = press }
            .semantics(mergeDescendants = true) {
                contentDescription = label
                if (onPress != null) role = Role.Button
                if (values.isForeground) selected = true
            }
            .then(tap),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.sizeIn(minWidth = values.tapTargetDp.dp, minHeight = values.tapTargetDp.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (values.drawsDisc) {
                MeeshyBlurDisc(values.discDiameterDp / 2f, discTint, values.discOpacity, values.discDashed, reduce)
            }
            if (values.drawsPulse) {
                Box(
                    Modifier
                        .wrapContentSize(unbounded = true)
                        .requiredSize((values.contentDp + 2 * MeeshyMapPinRecipe.PULSE_OFFSET_DP).dp)
                        .decorative()
                        .drawBehind {
                            val progress = pulse?.value ?: 0.2f
                            val grown = size.minDimension / 2f * (PULSE_START + PULSE_SPAN * progress)
                            drawCircle(tint.copy(alpha = 1f - progress), radius = grown, style = Stroke(MeeshyMapPinRecipe.PULSE_RING_DP.dp.toPx()))
                        },
                )
            }
            if (values.drawsPoint) {
                Box(
                    Modifier
                        .offset(y = (values.contentDp / 2f).dp)
                        .size(MeeshyMapPinRecipe.POINT_DP.dp)
                        .rotate(45f)
                        .background(linerColor, RoundedCornerShape(POINT_RADIUS_DP.dp))
                        .decorative(),
                )
            }
            if (values.drawsRing) {
                Box(
                    Modifier
                        .requiredSize((values.contentDp + 2 * RING_GAP_DP).dp)
                        .border(SELECT_RING_DP.dp, tint, CircleShape)
                        .decorative(),
                )
            }
            Box(
                Modifier
                    .size(values.contentDp.dp)
                    .shadow(10.dp, CircleShape)
                    .clip(CircleShape)
                    .background(linerColor)
                    .padding(values.linerDp.dp)
                    .clip(CircleShape)
                    .alpha(values.contentOpacity),
                contentAlignment = Alignment.Center,
            ) { content() }
            if (badge != null) {
                Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .offset(x = 2.dp, y = 2.dp)
                        .size(MeeshyMapPinRecipe.BADGE_DP.dp),
                    contentAlignment = Alignment.Center,
                ) { badge() }
            }
        }
        MeeshyMapPinRecipe.caption(caption)?.let { text ->
            Box(
                Modifier
                    .padding(top = MeeshyMapPinRecipe.CAPTION_GAP_DP.dp)
                    .sizeIn(minHeight = MeeshyMapPinRecipe.CAPTION_HEIGHT_DP.dp)
                    .background(tokens.backgroundPrimary.copy(alpha = 0.92f), CircleShape)
                    .padding(horizontal = 8.dp)
                    .decorative(),
                contentAlignment = Alignment.Center,
            ) {
                Text(text, color = tokens.textPrimary, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Clip)
            }
        }
    }
}

/**
 * **Le disque de flou** de l'épingle : « elle est quelque part là-dedans ». Diamètre = 2 × [radiusDp], teinte à [opacity],
 * bord de 1,5 à la teinte pleine (en pointillé quand l'épingle est périmée), il respire de 5 % en 5 s sauf en mouvement
 * réduit. Décoratif : la carte dessous reste à l'hôte.
 */
@Composable
public fun MeeshyBlurDisc(
    radiusDp: Float,
    tint: Color,
    opacity: Float,
    isDashed: Boolean,
    reduceMotion: Boolean,
    modifier: Modifier = Modifier,
) {
    val breath = if (reduceMotion) {
        null
    } else {
        rememberInfiniteTransition(label = "disc-breath").animateFloat(
            initialValue = 1f,
            targetValue = BREATH_SCALE,
            animationSpec = infiniteRepeatable(tween(BREATH_MILLIS / 2, easing = LinearEasing), RepeatMode.Reverse),
            label = "disc-breath-scale",
        )
    }
    Box(
        modifier
            .wrapContentSize(unbounded = true)
            .requiredSize((radiusDp * 2f).dp)
            .graphicsLayer {
                val scale = breath?.value ?: 1f
                scaleX = scale
                scaleY = scale
            }
            .decorative()
            .drawBehind {
                drawCircle(tint.copy(alpha = opacity))
                val dash = if (isDashed) PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx())) else null
                drawCircle(tint, radius = size.minDimension / 2f - DISC_BORDER_DP.dp.toPx() / 2f, style = Stroke(DISC_BORDER_DP.dp.toPx(), pathEffect = dash))
            },
    )
}

/**
 * **La grappe** (K36) : jusqu'à trois contenus de 36 dp recouverts de 8, dans une gélule, et le compte au coin haut de fin.
 * Elle affiche le [count] qu'on lui donne (« 99+ » au-delà de 99) ; qui se regroupe, à quel zoom, c'est l'hôte. Un toucher :
 * l'hôte zoome dessus. Sous deux, elle ne se dessine pas.
 */
@Composable
public fun MeeshyPinCluster(
    count: Int,
    label: String,
    modifier: Modifier = Modifier,
    tint: Color = MeeshyPalette.Indigo500,
    onPress: (() -> Unit)? = null,
    contents: List<@Composable () -> Unit>,
) {
    val text = MeeshyMapPinRecipe.clusterCount(count) ?: return
    val tokens = MeeshyTheme.tokens
    val tap = if (onPress != null) Modifier.clickable(role = Role.Button, onClick = onPress) else Modifier
    Box(
        modifier
            .sizeIn(minWidth = MeeshyMapPinRecipe.TAP_TARGET_DP.dp, minHeight = MeeshyMapPinRecipe.TAP_TARGET_DP.dp)
            .semantics(mergeDescendants = true) { contentDescription = label }
            .then(tap),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            Modifier.background(tokens.backgroundPrimary, CircleShape).padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy((-MeeshyMapPinRecipe.CLUSTER_OVERLAP_DP).dp),
        ) {
            contents.take(MeeshyMapPinRecipe.CLUSTER_MAX).forEach { slot ->
                Box(Modifier.size(MeeshyMapPinRecipe.CLUSTER_DP.dp).clip(CircleShape).border(2.dp, tokens.backgroundPrimary, CircleShape)) { slot() }
            }
        }
        Box(
            Modifier
                .align(Alignment.TopEnd)
                .size(MeeshyMapPinRecipe.CLUSTER_COUNT_DP.dp)
                .background(tint, CircleShape)
                .decorative(),
            contentAlignment = Alignment.Center,
        ) {
            Text(text, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1)
        }
    }
}
