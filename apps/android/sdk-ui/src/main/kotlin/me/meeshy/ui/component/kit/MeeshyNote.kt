package me.meeshy.ui.component.kit

import androidx.compose.animation.Crossfade
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyMotionRecipe
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val LOW_ALPHA = 0.35f
private const val HALO_ALPHA = 0.25f
private const val HALO_SCALE = 1.9f

/** La tête d'une note : un glyphe (à défaut, celui du sens), un point, un point pulsé, ou rien. */
public sealed interface MeeshyNoteLead {
    public data class Icon(val icon: ImageVector) : MeeshyNoteLead

    public data object Dot : MeeshyNoteLead

    public data object Pulse : MeeshyNoteLead

    public data object None : MeeshyNoteLead
}

/** Une ligne de [MeeshyNoteList] : un glyphe et une phrase déjà traduite. */
public data class MeeshyNoteItem(val icon: ImageVector, val text: String)

@Composable
private fun noteBase(kind: MeeshyNoteKind, tint: Color?): Color {
    val tokens = MeeshyTheme.tokens
    return tint ?: when (kind) {
        MeeshyNoteKind.Neutral -> tokens.textSecondary
        MeeshyNoteKind.Info -> MeeshyPalette.Indigo500
        MeeshyNoteKind.Ok -> tokens.success
        MeeshyNoteKind.Warn -> tokens.warning
        MeeshyNoteKind.Security -> tokens.info
    }
}

private fun defaultGlyph(kind: MeeshyNoteKind): ImageVector = when (kind) {
    MeeshyNoteKind.Neutral, MeeshyNoteKind.Info -> MeeshyIcons.Info
    MeeshyNoteKind.Ok -> MeeshyIcons.CheckCircle
    MeeshyNoteKind.Warn -> MeeshyIcons.Warning
    MeeshyNoteKind.Security -> MeeshyIcons.Shield
}

/**
 * **La note qui dit, reste, et ne flotte pas** (K46) : une tête (glyphe, point, point pulsé) et une phrase, sur autant de lignes
 * qu'il faut, dans l'une des formes [MeeshyNoteForm] et l'un des sens [MeeshyNoteKind]. Elle vit dans le flux : elle pousse ce
 * qui la suit, n'est jamais minutée ni fermée d'une croix, et se replie quand ce qu'elle dit n'est plus vrai (le message éphémère
 * est un `MeeshyStatusCapsule`). [emphasis] met une valeur en gras où qu'elle tombe ; [detail] est une seconde ligne (bande et
 * bandeau seulement) ; [action] est un `MeeshyButton` en texte ou à contour, qui passe à la ligne sous 320 dp.
 *
 * [announces] vaut vrai par défaut pour `warn` seul : la voix la dit une fois, à l'arrivée. [isStale] fige le point et tombe au
 * neutre (en `live`). Jumeau iOS : `MeeshyNote`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyNote(
    text: String,
    modifier: Modifier = Modifier,
    form: MeeshyNoteForm = MeeshyNoteForm.Line,
    kind: MeeshyNoteKind = MeeshyNoteKind.Neutral,
    lead: MeeshyNoteLead? = null,
    detail: String? = null,
    emphasis: String? = null,
    size: MeeshyNoteSize = MeeshyNoteSize.Regular,
    isStale: Boolean = false,
    tint: Color? = null,
    announces: Boolean? = null,
    label: String? = null,
    action: (@Composable () -> Unit)? = null,
) {
    if (!MeeshyNoteRecipe.isVisible(text)) return
    val reduce = LocalReduceMotion.current
    val effectiveLead = lead ?: if (form == MeeshyNoteForm.Live) MeeshyNoteLead.Pulse else MeeshyNoteLead.Icon(defaultGlyph(kind))
    val leadShape = when (effectiveLead) {
        is MeeshyNoteLead.Icon -> MeeshyNoteLeadShape.Glyph
        MeeshyNoteLead.Dot -> MeeshyNoteLeadShape.Dot
        MeeshyNoteLead.Pulse -> MeeshyNoteLeadShape.Pulse
        MeeshyNoteLead.None -> MeeshyNoteLeadShape.None
    }
    val values = MeeshyNoteRecipe.resolve(form, kind, leadShape, size, isStale, detail != null, action != null, reduce)
    val color = noteBase(values.kind, tint)
    val textColor = if (values.tintsText) color else MeeshyTheme.tokens.textPrimary
    val hairline = MeeshyTheme.tokens.hairline
    val live = if (MeeshyNoteRecipe.announces(kind, announces)) LiveRegionMode.Polite else null
    val inset = values.insetsDp
    val shape = RoundedCornerShape(values.cornerRadiusDp.dp)

    BoxWithConstraints(modifier = modifier.let { if (values.fillsWidth) it.fillMaxWidth() else it }) {
        val wraps = action != null && MeeshyNoteRecipe.actionWraps(maxWidth.value)
        Column(
            modifier = Modifier
                .let { if (values.fillsWidth) it.fillMaxWidth() else it }
                .let { if (values.animatesHeight) it.animateContentSize(MeeshyMotion.springDefault<IntSize>()) else it }
                .clip(shape)
                .background(color.copy(alpha = values.tintAlpha))
                .drawBehind {
                    if (values.accentBarDp > 0) {
                        val bar = values.accentBarDp.dp.toPx()
                        val x = if (layoutDirection == LayoutDirection.Rtl) this.size.width - bar else 0f
                        drawRect(color, Offset(x, 0f), Size(bar, this.size.height))
                    }
                    if (values.hasBottomHairline) drawRect(hairline, Offset(0f, this.size.height - 1.dp.toPx()), Size(this.size.width, 1.dp.toPx()))
                }
                .heightIn(min = values.minHeightDp.dp)
                .padding(start = inset[3].dp, top = inset[0].dp, end = inset[1].dp, bottom = inset[2].dp)
                .semantics(mergeDescendants = true) {
                    label?.let { contentDescription = it }
                    live?.let { liveRegion = it }
                },
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
                NoteLead(effectiveLead, values, color)
                Column(Modifier.weight(1f)) {
                    Crossfade(targetState = text, animationSpec = tween(MeeshyNoteRecipe.CROSSFADE_MILLIS), label = "note-text") { current ->
                        Text(
                            text = notePhrase(current, emphasis),
                            color = textColor,
                            fontSize = values.textSp.sp,
                            lineHeight = (values.textSp * values.lineHeightFactor).sp,
                            fontWeight = FontWeight(values.textWeight),
                        )
                    }
                    if (values.showsDetail && detail != null) {
                        Text(detail, color = MeeshyTheme.tokens.textSecondary, fontSize = 12.sp, modifier = Modifier.padding(top = 1.dp))
                    }
                }
                if (action != null && !wraps) action()
            }
            if (action != null && wraps) Box(Modifier.padding(top = 4.dp)) { action() }
        }
    }
}

private fun notePhrase(text: String, emphasis: String?) = buildAnnotatedString {
    MeeshyNoteRecipe.segments(text, emphasis).forEach { segment ->
        if (segment.isEmphasis) withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(segment.text) } else append(segment.text)
    }
}

@Composable
private fun NoteLead(lead: MeeshyNoteLead, values: MeeshyNoteValues, color: Color) {
    when (lead) {
        MeeshyNoteLead.None -> Unit
        is MeeshyNoteLead.Icon -> Icon(lead.icon, contentDescription = null, tint = color, modifier = Modifier.size(values.glyphDp.dp).decorative())
        MeeshyNoteLead.Dot, MeeshyNoteLead.Pulse -> {
            val alpha = if (values.pulses) {
                rememberInfiniteTransition(label = "note-dot").animateFloat(
                    initialValue = 1f,
                    targetValue = LOW_ALPHA,
                    animationSpec = infiniteRepeatable(tween(MeeshyMotionRecipe.PULSE_MILLIS, easing = LinearEasing), RepeatMode.Reverse),
                    label = "note-dot-alpha",
                ).value
            } else {
                1f
            }
            Box(Modifier.size(MeeshyNoteRecipe.DOT_DP.dp * HALO_SCALE).decorative(), contentAlignment = Alignment.Center) {
                if (values.showsHalo) Box(Modifier.size(MeeshyNoteRecipe.DOT_DP.dp * HALO_SCALE).background(color.copy(alpha = HALO_ALPHA), CircleShape))
                Box(Modifier.size(MeeshyNoteRecipe.DOT_DP.dp).alpha(alpha).background(color, CircleShape))
            }
        }
    }
}

/** La forme liste : des lignes glyphe + phrase, du texte à 13 (compact) ou 14,5 (régulier), dans le flux. */
@Composable
public fun MeeshyNoteList(
    items: List<MeeshyNoteItem>,
    modifier: Modifier = Modifier,
    kind: MeeshyNoteKind = MeeshyNoteKind.Neutral,
    size: MeeshyNoteSize = MeeshyNoteSize.Regular,
) {
    if (items.isEmpty()) return
    val color = noteBase(kind, null)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items.forEach { item ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
                Icon(item.icon, contentDescription = null, tint = color, modifier = Modifier.size(16.dp).decorative())
                Text(item.text, color = MeeshyTheme.tokens.textPrimary, fontSize = MeeshyNoteRecipe.listTextSp(size).sp)
            }
        }
    }
}
