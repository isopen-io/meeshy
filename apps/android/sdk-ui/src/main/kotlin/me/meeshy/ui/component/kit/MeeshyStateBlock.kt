package me.meeshy.ui.component.kit

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val SHAKE_STEP_MILLIS = 60
private const val HALO_ALPHA = 0.14f
private const val GHOST_ALPHA = 0.1f

/** Une sortie du bloc : un titre, un effet, et l'état « en cours » que l'hôte tient. */
public data class MeeshyStateBlockAction(
    val title: String,
    val isPending: Boolean = false,
    val perform: () -> Unit,
)

/** L'image du bloc : un fantôme de ce qui manque, le seul glyphe, ou rien. */
public sealed interface MeeshyStateArt {
    public data class Ghost(val template: MeeshyStateGhostTemplate, val count: Int = 3) : MeeshyStateArt

    public data object Glyph : MeeshyStateArt

    public data object None : MeeshyStateArt
}

private fun defaultGlyph(kind: MeeshyStateBlockKind): ImageVector = when (kind) {
    MeeshyStateBlockKind.Empty -> MeeshyIcons.Inbox
    MeeshyStateBlockKind.Error -> MeeshyIcons.Warning
    MeeshyStateBlockKind.Denied -> MeeshyIcons.Lock
    MeeshyStateBlockKind.Offline -> MeeshyIcons.WifiOff
    MeeshyStateBlockKind.Success -> MeeshyIcons.Check
}

@Composable
private fun toneColor(tone: MeeshyStateBlockTone, tint: Color?): Color {
    val tokens = MeeshyTheme.tokens
    return when (tone) {
        MeeshyStateBlockTone.Accent -> tint ?: MeeshyPalette.Indigo500
        MeeshyStateBlockTone.Err -> tokens.error
        MeeshyStateBlockTone.Warn -> tokens.warning
        MeeshyStateBlockTone.Neutral -> tokens.textMuted
        MeeshyStateBlockTone.Ok -> tokens.success
    }
}

/**
 * **Le bloc d'état** (K38) : vide, erreur, refus, hors ligne et réussite ont UNE forme — une image fantôme, un titre, une
 * phrase, une sortie. Il dessine l'absence, il ne la décide pas : l'hôte lit son état, choisit le [kind] et passe les mots.
 * Sans la sortie que la loi exige (une erreur sans « Réessayer », un vide plein écran sans issue), il ne se dessine pas.
 *
 * Un seul élément pour la voix (le titre puis la phrase) ; l'image et le halo se taisent ; une erreur est une alerte dite
 * une fois, et vibre à l'entrée. Sous mouvement réduit : ni secousse, ni respiration, ni halo. Jumeau iOS : `MeeshyStateBlock`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod", "CyclomaticComplexMethod")
public fun MeeshyStateBlock(
    kind: MeeshyStateBlockKind,
    title: String,
    modifier: Modifier = Modifier,
    message: String? = null,
    primary: MeeshyStateBlockAction? = null,
    secondary: MeeshyStateBlockAction? = null,
    art: MeeshyStateArt = MeeshyStateArt.Ghost(MeeshyStateGhostTemplate.Line),
    glyph: ImageVector? = null,
    consequences: List<String> = emptyList(),
    isOverContent: Boolean = false,
    size: MeeshyStateBlockSize = MeeshyStateBlockSize.Regular,
    tint: Color? = null,
    announces: Boolean = true,
    label: String? = null,
    hapticOnError: Boolean = true,
) {
    val reduce = LocalReduceMotion.current
    val values = MeeshyStateBlockRecipe.resolve(kind, size, primary != null, secondary != null, isOverContent, reduce)
    val haptics = rememberMeeshyHaptics()
    val shake = remember { Animatable(0f) }
    val entersAsError = values.isResolvable && values.hapticOnEnter && hapticOnError
    LaunchedEffect(entersAsError, values.shakes) {
        if (entersAsError) haptics.rigid()
        if (values.shakes) {
            listOf(-1f, 1f, -0.6f, 0.6f, 0f).forEach { shake.animateTo(it, tween(SHAKE_STEP_MILLIS, easing = LinearEasing)) }
        }
    }
    if (!values.isResolvable) return
    val tokens = MeeshyTheme.tokens
    val tone = toneColor(values.glyphTone, tint)
    val spoken = label ?: listOfNotNull(title, message.takeIf { values.size == MeeshyStateBlockSize.Regular }).joinToString(", ")
    val exit = primary ?: secondary
    val second = if (primary == null) null else secondary
    val columnModifier = modifier
        .fillMaxWidth()
        .graphicsLayer { translationX = shake.value * MeeshyStateBlockRecipe.ENTER_SHAKE_DP.dp.toPx() }
        .semantics(mergeDescendants = true) {
            contentDescription = spoken
            if (announces) liveRegion = if (values.isAlert) LiveRegionMode.Assertive else LiveRegionMode.Polite
        }
    if (values.size == MeeshyStateBlockSize.Compact) {
        Row(
            columnModifier.heightIn(min = MeeshyStateBlockRecipe.ROW_HEIGHT_DP.dp).padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(glyph ?: defaultGlyph(kind), contentDescription = null, tint = tone, modifier = Modifier.size(22.dp).decorative())
            Text(title, color = tokens.textPrimary, fontSize = values.titleSp.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            exit?.let { StateExit(it, MeeshyButtonKind.Text, MeeshyButtonSize.S44, Modifier) }
        }
        return
    }
    Column(columnModifier.padding(horizontal = 24.dp, vertical = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        if (art !is MeeshyStateArt.None && !isOverContent) {
            val breath = if (values.breathes) {
                rememberInfiniteTransition(label = "state-float").animateFloat(
                    initialValue = 0f,
                    targetValue = 1f,
                    animationSpec = infiniteRepeatable(tween(MeeshyStateBlockRecipe.FLOAT_MILLIS / 2, easing = LinearEasing), RepeatMode.Reverse),
                    label = "state-float-progress",
                )
            } else {
                null
            }
            if (values.hasGhost && art is MeeshyStateArt.Ghost) {
                StateGhost(art.template, MeeshyStateBlockRecipe.ghostCount(art.count), tone)
            }
            Box(
                Modifier
                    .graphicsLayer { translationY = -(breath?.value ?: 0f) * 4.dp.toPx() }
                    .size(MeeshyStateBlockRecipe.GLYPH_DISC_DP.dp)
                    .background(tone.copy(alpha = if (values.hasHalo) HALO_ALPHA * 2f else HALO_ALPHA), CircleShape)
                    .decorative(),
                contentAlignment = Alignment.Center,
            ) {
                Icon(glyph ?: defaultGlyph(kind), contentDescription = null, tint = tone, modifier = Modifier.size(MeeshyStateBlockRecipe.GLYPH_ICON_DP.dp))
            }
        }
        Text(
            title,
            color = tokens.textPrimary,
            fontSize = values.titleSp.sp,
            fontWeight = FontWeight.ExtraBold,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 16.dp),
        )
        if (message != null) {
            Text(
                message,
                color = tokens.textSecondary,
                fontSize = MeeshyStateBlockRecipe.MESSAGE_SP.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 6.dp).widthIn(max = MeeshyStateBlockRecipe.MESSAGE_MAX_DP.dp),
            )
        }
        if (kind == MeeshyStateBlockKind.Success) {
            consequences.take(MAX_CONSEQUENCES).forEach { line ->
                Text(line, color = tokens.textSecondary, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
            }
        }
        exit?.let { StateExit(it, MeeshyButtonKind.Primary, MeeshyButtonSize.S50, Modifier.padding(top = 20.dp)) }
        second?.let { StateExit(it, MeeshyButtonKind.Text, MeeshyButtonSize.S44, Modifier.padding(top = 8.dp)) }
    }
}

private const val MAX_CONSEQUENCES = 4

@Composable
private fun StateExit(action: MeeshyStateBlockAction, kind: MeeshyButtonKind, size: MeeshyButtonSize, modifier: Modifier) {
    MeeshyButton(
        title = action.title,
        onClick = action.perform,
        modifier = modifier,
        kind = kind,
        size = size,
        isPending = action.isPending,
        enabled = !action.isPending,
    )
}

@Composable
private fun StateGhost(template: MeeshyStateGhostTemplate, count: Int, tone: Color) {
    val ink = MeeshyTheme.tokens.textPrimary.copy(alpha = GHOST_ALPHA)
    val ghostHeight = MeeshyStateBlockRecipe.GHOST_MAX_HEIGHT_DP.dp
    Column(
        Modifier.fillMaxWidth().heightIn(max = ghostHeight).padding(bottom = 16.dp).decorative(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        repeat(count) { index ->
            val shape = when (template) {
                MeeshyStateGhostTemplate.Tile -> RoundedCornerShape(18.dp)
                MeeshyStateGhostTemplate.Pin -> CircleShape
                else -> RoundedCornerShape(12.dp)
            }
            val height = when (template) {
                MeeshyStateGhostTemplate.Line -> 10.dp
                MeeshyStateGhostTemplate.Ticket -> 44.dp
                MeeshyStateGhostTemplate.Row -> 36.dp
                MeeshyStateGhostTemplate.Tile -> 56.dp
                MeeshyStateGhostTemplate.Pin -> 40.dp
            }
            val width = if (template == MeeshyStateGhostTemplate.Pin) height else (1f - index * 0.12f).coerceAtLeast(0.4f).let { 260.dp * it }
            Box(Modifier.size(width, height).background(if (index == 0) tone.copy(alpha = GHOST_ALPHA) else ink, shape))
        }
    }
}
