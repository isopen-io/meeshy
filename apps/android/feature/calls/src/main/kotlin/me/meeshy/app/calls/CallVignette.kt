package me.meeshy.app.calls

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.VectorConverter
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallHeaderNames
import me.meeshy.sdk.model.call.CallReducedCaption
import me.meeshy.sdk.model.call.CallVignetteGlide
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor
import kotlin.math.roundToInt

private val VIGNETTE_WIDTH = 90.dp
private val VIGNETTE_HEIGHT = 160.dp
private val VIGNETTE_RADIUS = 20.dp
private val VIGNETTE_MARGIN = 12.dp

/**
 * #19701 — l'appel réduit flotte en UNE vignette rectangulaire, en audio comme en vidéo (iOS `CallBubbleView`, web
 * `CallBubble`). Elle ne porte AUCUN bouton (#19696) : la personne — sa vidéo si sa caméra tourne, sinon son avatar —
 * et « nom · durée ». Un toucher rouvre l'appel ; le doigt la porte image par image et, au lâcher, l'élan la fait
 * glisser puis la pose au bord le plus proche ([CallVignetteGlide]). Montée par l'hôte en DERNIER calque de l'app, elle
 * reste au-dessus de tout ce qui se voit.
 */
@Composable
fun CallVignetteLayer(
    state: CallUiState,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    peerAvatarUrl: String? = null,
    peerUserId: String = "",
    names: CallHeaderNames = CallHeaderNames(givenName = null, groupName = null),
    reduceMotion: Boolean = LocalReduceMotion.current,
    video: (@Composable (Modifier) -> Unit)? = null,
) {
    BoxWithConstraints(modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
        val density = LocalDensity.current
        val bounds = with(density) {
            val margin = VIGNETTE_MARGIN.toPx()
            CallVignetteGlide.Bounds(
                minX = margin,
                maxX = maxOf(margin, maxWidth.toPx() - VIGNETTE_WIDTH.toPx() - margin),
                minY = margin,
                maxY = maxOf(margin, maxHeight.toPx() - VIGNETTE_HEIGHT.toPx() - margin),
            )
        }
        val maxGlide = with(density) { CallVignetteGlide.MAX_GLIDE_DP.dp.toPx() }
        val position = remember { Animatable(Offset(bounds.maxX, bounds.minY), Offset.VectorConverter) }
        val scope = rememberCoroutineScope()
        LaunchedEffect(bounds) {
            val kept = CallVignetteGlide.landing(position.value.x, position.value.y, 0f, 0f, bounds, maxGlide)
            position.snapTo(Offset(kept.x, kept.y))
        }
        fun settle(velocity: Offset) {
            val landing = CallVignetteGlide.landing(position.value.x, position.value.y, velocity.x, velocity.y, bounds, maxGlide)
            val target = Offset(landing.x, landing.y)
            scope.launch {
                if (reduceMotion) {
                    position.snapTo(target)
                } else {
                    position.animateTo(
                        target,
                        MeeshyMotion.springFor(response = GLIDE_RESPONSE, dampingFraction = CallVignetteGlide.DAMPING),
                        initialVelocity = velocity,
                    )
                }
            }
        }
        CallVignette(
            state = state,
            onClick = onClick,
            peerAvatarUrl = peerAvatarUrl,
            peerUserId = peerUserId,
            names = names,
            video = video,
            modifier = Modifier
                .offset { IntOffset(position.value.x.roundToInt(), position.value.y.roundToInt()) }
                .pointerInput(bounds, maxGlide, reduceMotion) {
                    val tracker = VelocityTracker()
                    var travelled = Offset.Zero
                    detectDragGestures(
                        onDragStart = {
                            tracker.resetTracking()
                            travelled = Offset.Zero
                            scope.launch { position.stop() }
                        },
                        onDrag = { change, drag ->
                            change.consume()
                            travelled += drag
                            tracker.addPosition(change.uptimeMillis, travelled)
                            scope.launch { position.snapTo(position.value + drag) }
                        },
                        onDragEnd = {
                            val velocity = tracker.calculateVelocity()
                            settle(Offset(velocity.x, velocity.y))
                        },
                        onDragCancel = { settle(Offset.Zero) },
                    )
                },
        )
    }
}

/** La vignette elle-même : la personne et « nom · durée », sans aucun contrôle. */
@Composable
fun CallVignette(
    state: CallUiState,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    peerAvatarUrl: String? = null,
    peerUserId: String = "",
    names: CallHeaderNames = CallHeaderNames(givenName = null, groupName = null),
    video: (@Composable (Modifier) -> Unit)? = null,
) {
    val title = CallReducedCaption.title(names.givenName, names.groupName, displayName = state.peerName)
    val ongoingLabel = stringResource(R.string.call_pill_ongoing, title ?: state.peerName)
    val reopenLabel = stringResource(R.string.call_pill_reopen)
    val accent = hexColor(CallTileRim.peerAvatar(peerUserId, state.peerName))
    val rim = CallTileRim.reducedRim(peerUserId, state.peerName, MeeshyTheme.tokens.warning)
    val shape = RoundedCornerShape(VIGNETTE_RADIUS)
    Box(
        modifier = modifier
            .size(VIGNETTE_WIDTH, VIGNETTE_HEIGHT)
            .clip(shape)
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .border(rim, shape)
            .clickable(onClickLabel = reopenLabel, onClick = onClick)
            .semantics { contentDescription = ongoingLabel },
        contentAlignment = Alignment.Center,
    ) {
        if (video != null) {
            video(Modifier.fillMaxSize())
        } else {
            MeeshyAvatar(
                name = state.peerName,
                size = 56.dp,
                containerColor = accent,
                imageUrl = peerAvatarUrl,
                modifier = Modifier.clearAndSetSemantics { },
            )
        }
        Text(
            text = CallReducedCaption.caption(title, pillStatusLine(state)),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = Color.White,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.6f))))
                .padding(horizontal = MeeshySpacing.xs, vertical = MeeshySpacing.xs)
                .clearAndSetSemantics { },
        )
    }
}

/** La raideur de Spring.StiffnessMediumLow (400), dite en réponse iOS : (2π / 0,314)² ≈ 400. */
private const val GLIDE_RESPONSE = 0.314f
