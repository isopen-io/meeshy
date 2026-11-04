package me.meeshy.ui.component.focal

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventTimeoutCancellationException
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.reading.focal.FocalFocusChipsLaw
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.ui.R
import me.meeshy.ui.component.bubble.FlatRowMetrics
import me.meeshy.ui.component.bubble.ReactionEntry
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Un drapeau de la bande : la langue [code], son glyphe, son nom, et s'il est la langue servie. */
@Immutable
internal data class FocalFlag(
    val code: String,
    val glyph: String,
    val description: String,
    val isActive: Boolean,
)

/** Ce que la bande de puces de l'élu montre (iOS `electedStrip`) ; les rappels vivent à côté. */
@Immutable
internal data class FocalChipsBandState(
    /** Le message a plusieurs langues : la puce de détails et les drapeaux se posent. */
    val translatable: Boolean,
    val flags: List<FocalFlag>,
    val reactions: List<ReactionEntry>,
    /** La date complète de l'élu (`FocalFocusTimestamp`). */
    val timestampLabel: String,
)

@Immutable
internal data class FocalChipsBandActions(
    val onTranslationDetail: (() -> Unit)? = null,
    val onFlagTap: ((String) -> Unit)? = null,
    val onAddReaction: (() -> Unit)? = null,
    /** Tap sur une réaction : basculer la mienne. */
    val onReactionToggle: ((String) -> Unit)? = null,
    /** Appui long de 0,4 s sur une réaction : qui a réagi. */
    val onReactionWho: (() -> Unit)? = null,
    val onMessageInfo: (() -> Unit)? = null,
)

/**
 * Tap, ou appui long après [FocalFocusChipsLaw.REACTION_LONG_PRESS_MS] (iOS `LongPressGesture(0.4)`) :
 * le seuil est celui de la loi, pas celui du système. Un geste annulé (le doigt glisse) ne fait rien.
 */
internal fun Modifier.focalChipPress(onTap: (() -> Unit)?, onLongPress: (() -> Unit)?): Modifier = composed {
    val tap by rememberUpdatedState(onTap)
    val long by rememberUpdatedState(onLongPress)
    pointerInput(onTap != null, onLongPress != null) {
        awaitEachGesture {
            awaitFirstDown()
            try {
                val up = withTimeout(FocalFocusChipsLaw.REACTION_LONG_PRESS_MS) { waitForUpOrCancellation() }
                if (up != null) {
                    up.consume()
                    tap?.invoke()
                }
            } catch (_: PointerEventTimeoutCancellationException) {
                if (long != null) {
                    long?.invoke()
                    waitForUpOrCancellation()
                } else {
                    waitForUpOrCancellation()?.let { tap?.invoke() }
                }
            }
        }
    }
        .semantics {
            onTap?.let { action -> onClick { action(); true } }
            onLongPress?.let { action -> onLongClick { action(); true } }
        }
}

/** LA puce du focus : capsule opaque, lavis d'accent ; pleine d'accent pour « j'ai réagi ». */
@Composable
internal fun FocusChip(
    accent: Color,
    modifier: Modifier = Modifier,
    isActive: Boolean = false,
    filled: Boolean = false,
    height: Dp = ElectedMetrics.chipHeight,
    onClick: (() -> Unit)? = null,
    onLongClick: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val dark = MeeshyTheme.isDark
    val wash = FocalFocusChipsLaw.fillOpacity(isDark = dark, isActive = isActive)
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .height(height)
            .widthIn(min = ElectedMetrics.chipMinWidth)
            .clip(CircleShape)
            .background(if (filled) accent else MeeshyTheme.tokens.backgroundSecondary)
            .background(if (filled) Color.Transparent else accent.copy(alpha = wash))
            .let { base -> if (onClick == null && onLongClick == null) base else base.focalChipPress(onClick, onLongClick) }
            .padding(horizontal = MeeshySpacing.xsPlus),
    ) { content() }
}

/**
 * La bande basse de l'élu, dans CET ordre (directive iOS 2026-08-22) : détails de traduction,
 * drapeaux (cinq au plus, la langue servie toujours visible et pleine), (+) réaction, réactions
 * (pleines si j'ai réagi) ; à droite la date complète et la coche ([status]), qui ouvrent les
 * détails du message. Haptiques : légère au tap, moyenne à l'appui long.
 */
@Composable
internal fun FocalChipsBand(
    state: FocalChipsBandState,
    accent: Color,
    actions: FocalChipsBandActions,
    modifier: Modifier = Modifier,
    status: @Composable () -> Unit = {},
) {
    val dark = MeeshyTheme.isDark
    val metaTint = if (dark) Color.White.copy(alpha = 0.55f) else Color.Black.copy(alpha = 0.55f)
    val haptics = rememberMeeshyHaptics()
    val shown = remember(state.flags) {
        val keep = FocalFocusChipsLaw.flagWindow(
            codes = state.flags.map { it.code },
            activeCode = state.flags.firstOrNull { it.isActive }?.code,
            limit = FocalMetrics.FocusStrip.FLAG_LIMIT_MAGNIFIED,
        )
        keep.mapNotNull { code -> state.flags.firstOrNull { it.code.equals(code, ignoreCase = true) } }
    }
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.padding(start = ElectedMetrics.chipInset),
        ) {
            if (state.translatable) {
                val label = stringResource(R.string.focal_focus_translation_detail)
                FocusChip(
                    accent = accent,
                    onClick = actions.onTranslationDetail?.let { go -> { haptics.light(); go() } },
                    modifier = Modifier.semantics { contentDescription = label },
                ) {
                    Icon(MeeshyIcons.TranslateBubble, contentDescription = null, tint = accent, modifier = Modifier.size(13.dp))
                }
                shown.forEach { flag ->
                    FocusChip(
                        accent = accent,
                        isActive = flag.isActive,
                        onClick = actions.onFlagTap?.let { tap -> { haptics.light(); tap(flag.code) } },
                        modifier = Modifier.semantics { contentDescription = flag.description },
                    ) { Text(text = flag.glyph, fontSize = 12.sp) }
                }
            }
            val addLabel = stringResource(R.string.focal_focus_add_reaction)
            FocusChip(
                accent = accent,
                onClick = actions.onAddReaction?.let { go -> { haptics.light(); go() } },
                modifier = Modifier.semantics { contentDescription = addLabel },
            ) {
                Icon(MeeshyIcons.Emoji, contentDescription = null, tint = accent, modifier = Modifier.size(13.dp))
            }
            state.reactions.forEach { reaction ->
                FocusChip(
                    accent = accent,
                    filled = reaction.includesMe,
                    onClick = actions.onReactionToggle?.let { toggle -> { haptics.light(); toggle(reaction.emoji) } },
                    onLongClick = actions.onReactionWho?.let { who -> { haptics.medium(); who() } },
                    modifier = Modifier.semantics { contentDescription = "${reaction.emoji} ${reaction.count}" },
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                        Text(reaction.emoji, fontSize = 11.sp)
                        if (reaction.count > 1) {
                            Text(
                                "${reaction.count}",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (reaction.includesMe) Color.White else accent,
                            )
                        }
                    }
                }
            }
        }
        Spacer(Modifier.weight(1f))
        FocusChip(
            accent = accent,
            onClick = actions.onMessageInfo?.let { go -> { haptics.light(); go() } },
            modifier = Modifier.semantics { contentDescription = state.timestampLabel },
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = state.timestampLabel,
                    fontSize = FlatRowMetrics.TIME_SIZE_SP.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = metaTint,
                    maxLines = 1,
                )
                status()
            }
        }
    }
}
