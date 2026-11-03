package me.meeshy.ui.component.focal

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.reading.focal.LongMessageExcerpt
import me.meeshy.sdk.model.reading.focal.LongMessageExpansionLaw
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.bubble.ElectedGlassCard
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import kotlin.math.roundToInt

/**
 * Le dépliage d'un long message tel que l'hôte du fil le tient (iOS `LongMessageExpansion`) : un
 * SEUL message déplié à la fois, c'est l'hôte qui le sait. [onToggle] bascule ce message-ci.
 */
@Immutable
public class FlatRowExpansion(
    public val isExpanded: Boolean,
    public val onToggle: () -> Unit,
)

/** L'expansion de la rangée courante ; absente, le texte garde son propre état local. */
public val LocalFlatRowExpansion = staticCompositionLocalOf<FlatRowExpansion?> { null }

/** La courbe et la durée de la hauteur (0,3 s, (0,2 ; 0 ; 0 ; 1)) ; `snap` en Réduire les animations. */
@Composable
internal fun rememberExpansionSpec(): FiniteAnimationSpec<IntSize> {
    val reduce = LocalReduceMotion.current
    return remember(reduce) {
        val timing = LongMessageExpansionLaw.heightTiming(reduce)
        if (timing == null) {
            snap<IntSize>()
        } else {
            val (x1, y1, x2, y2) = timing.controlPoints.map { it.toFloat() }
            tween<IntSize>(durationMillis = Math.round(timing.durationSeconds * 1000.0).toInt(), easing = CubicBezierEasing(x1, y1, x2, y2))
        }
    }
}

/**
 * Le texte d'un message qui peut être long : au-delà du seuil de la loi (`LongMessageExcerpt`) il
 * s'ouvre sur son extrait suivi de « Lire la suite », et se replie par « Réduire ». La hauteur
 * s'anime sur place. L'état vient de [expansion] (l'hôte du fil) ou, sans hôte, d'un état local.
 */
@Composable
internal fun FocalLongMessage(
    messageId: String,
    text: String,
    accentColor: Color,
    modifier: Modifier = Modifier,
    expansion: FlatRowExpansion? = LocalFlatRowExpansion.current,
    body: @Composable (shown: String) -> Unit,
) {
    val excerpt = remember(text) { LongMessageExcerpt.of(text) }
    var localExpanded by rememberSaveable(messageId) { mutableStateOf(false) }
    val expanded = expansion?.isExpanded ?: localExpanded
    val toggle: () -> Unit = expansion?.onToggle ?: { localExpanded = !localExpanded }
    Column(modifier = modifier.animateContentSize(rememberExpansionSpec())) {
        body(if (excerpt.truncated && !expanded) excerpt.excerpt + "…" else text)
        if (excerpt.truncated) {
            Text(
                text = stringResource(if (expanded) R.string.message_long_collapse else R.string.message_long_read_more),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = accentColor,
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .clickable(role = Role.Button, onClick = toggle)
                    .padding(vertical = MeeshySpacing.xxs),
            )
        }
    }
}

/**
 * Le bloc de verre du message déplié (iOS `FocalGlassBlock` sous `focusCardBackground`) : il
 * épouse le contenu (+6 en horizontal, +3 en vertical, `LongMessageExpansionLaw.glassFrame`) sans
 * changer sa taille, et suit sa hauteur pendant l'animation. Il se fond à l'apparition et au repli.
 */
@Composable
internal fun ExpandedGlassFrame(
    visible: Boolean,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val reduce = LocalReduceMotion.current
    val fade by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = if (reduce) snap<Float>() else tween<Float>(durationMillis = FADE_MS),
        label = "expanded-glass",
    )
    val card: @Composable () -> Unit = {
        if (fade > 0f) Box(Modifier.graphicsLayer { alpha = fade }) { ElectedGlassCard() }
    }
    Layout(contents = listOf(content, card), modifier = modifier) { measurables, constraints ->
        val (contentM, cardM) = measurables
        val contentP = contentM.first().measure(constraints)
        val w = contentP.width.toFloat()
        val h = contentP.height.toFloat()
        val frame = LongMessageExpansionLaw.glassFrame(
            bubble = LongMessageExpansionLaw.Rect(0f, 0f, w, h),
            row = LongMessageExpansionLaw.Rect(0f, 0f, w, h),
        )
        val cardP = cardM.firstOrNull()?.measure(
            Constraints.fixed((frame.right - frame.left).roundToInt(), (frame.bottom - frame.top).roundToInt()),
        )
        layout(contentP.width, contentP.height) {
            cardP?.place(frame.left.roundToInt(), frame.top.roundToInt())
            contentP.place(0, 0)
        }
    }
}

private const val FADE_MS = 150
