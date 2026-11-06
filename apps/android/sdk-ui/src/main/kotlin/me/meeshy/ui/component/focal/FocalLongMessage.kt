package me.meeshy.ui.component.focal

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.reading.focal.LongMessageExcerpt
import me.meeshy.sdk.model.reading.focal.LongMessageExpansionLaw
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion

/**
 * Le dépliage d'un long message tel que l'hôte du fil le tient (iOS `LongMessageExpansionState`, #16463) : plusieurs
 * messages peuvent être dépliés, aucun ne se replie. [onToggle] déplie ce message-ci.
 */
@Immutable
public class FlatRowExpansion(
    public val isExpanded: Boolean,
    public val onToggle: () -> Unit,
)

/** L'expansion de la rangée courante ; absente, le texte garde son propre état local. */
public val LocalFlatRowExpansion: ProvidableCompositionLocal<FlatRowExpansion?> = staticCompositionLocalOf { null }

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
 * Le texte d'un message qui peut être long : au-delà du seuil de la loi (`LongMessageExcerpt`) il s'ouvre sur son
 * extrait suivi de « Lire la suite ». Un toucher l'affiche EN ENTIER, comme un message ordinaire du mode courant, et le
 * bouton disparaît : aucun « Réduire » (#16465, iOS #16463). La suite se déroule sous l'extrait. L'état vient de
 * [expansion] (l'hôte du fil) ou, sans hôte, d'un état local qui ne revient pas en arrière.
 */
@Composable
internal fun FocalLongMessage(
    messageId: String,
    text: String,
    accentColor: Color,
    modifier: Modifier = Modifier,
    expansion: FlatRowExpansion? = LocalFlatRowExpansion.current,
    inkColor: Color? = null,
    body: @Composable (shown: String) -> Unit,
) {
    val excerpt = remember(text) { LongMessageExcerpt.of(text) }
    var localExpanded by rememberSaveable(messageId) { mutableStateOf(false) }
    val expanded = expansion?.isExpanded ?: localExpanded
    val expand: () -> Unit = expansion?.onToggle ?: { localExpanded = true }
    Column(modifier = modifier.animateContentSize(rememberExpansionSpec())) {
        body(if (excerpt.truncated && !expanded) excerpt.excerpt + "…" else text)
        if (excerpt.truncated && !expanded) {
            val state = stringResource(R.string.focal_long_message_collapsed)
            Box(
                contentAlignment = Alignment.CenterEnd,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = TOGGLE_MIN_TARGET)
                    .clickable(role = Role.Button, onClick = expand)
                    .semantics { stateDescription = state }
                    .padding(end = TOGGLE_END_CLEARANCE),
            ) {
                Text(
                    text = stringResource(R.string.message_long_read_more),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    textDecoration = TextDecoration.Underline,
                    color = inkColor ?: accentColor,
                )
            }
        }
    }
}

/** Cible tactile minimale du lien (48 dp), alignée en bas à droite. */
private val TOGGLE_MIN_TARGET = 48.dp

/** Marge de fin qui dégage le bouton de réaction posé sur le coin de la bulle. */
private val TOGGLE_END_CLEARANCE = 48.dp
