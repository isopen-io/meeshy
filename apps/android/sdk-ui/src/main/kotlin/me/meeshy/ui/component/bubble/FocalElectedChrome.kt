package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.component.focal.FocalChipsBand
import me.meeshy.ui.component.focal.FocalChipsBandActions
import me.meeshy.ui.component.focal.FocalChipsBandState
import me.meeshy.ui.component.focal.FocalFlag
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Ce que l'hôte dit à la rangée plate quand ELLE est l'élue de la scène Focal (iOS
 * `FocalRowInput.isFocused` + `focusTimestamp`) : la loupe de son contenu, sa date complète,
 * et les deux portes que la bande n'ouvre pas par les rappels de la bulle.
 */
@Immutable
public data class FlatRowFocus(
    /** Échelle du seul CONTENU (`FocalScrollPerspective.electedScale`) ; 1 en réduction de mouvement. */
    val contentScale: Float,
    /** « Aujourd'hui 12:30 », « Hier 18:30 », « Sam. 3 oct. 2025 · 14:41 » (`FocalFocusTimestamp`). */
    val timestampLabel: String,
    /** Chip de date : les détails du message. */
    val onShowMessageInfo: (() -> Unit)? = null,
    /** Icône de traduction : le détail des langues du message. */
    val onShowTranslationDetail: (() -> Unit)? = null,
)

/**
 * La bande basse de l'élu : l'adaptateur entre la bulle ([BubbleContent], [BubbleCallbacks]) et
 * [FocalChipsBand]. Les drapeaux et les détails de traduction reflètent la langue servie
 * (`LanguageChip.isActive`) ; la date suit `FocalFocusTimestamp` ([FlatRowFocus.timestampLabel]).
 */
@Composable
internal fun ElectedStrip(
    content: BubbleContent,
    focus: FlatRowFocus,
    accent: Color,
    callbacks: BubbleCallbacks,
) {
    val readTint = if (MeeshyTheme.isDark) MeeshyPalette.Indigo400 else MeeshyPalette.Indigo600
    val metaTint = if (MeeshyTheme.isDark) Color.White.copy(alpha = 0.55f) else Color.Black.copy(alpha = 0.55f)
    val state = remember(content.languageStrip, content.blurReveal, content.reactions, focus.timestampLabel) {
        FocalChipsBandState(
            translatable = content.languageStrip.size > 1 && content.blurReveal == null,
            flags = content.languageStrip.map { chip ->
                FocalFlag(
                    code = chip.code,
                    glyph = chip.info?.flag ?: chip.code.uppercase(),
                    description = chip.info?.name ?: chip.code,
                    isActive = chip.isActive,
                )
            },
            reactions = content.reactions,
            timestampLabel = focus.timestampLabel,
        )
    }
    FocalChipsBand(
        state = state,
        accent = accent,
        actions = FocalChipsBandActions(
            onTranslationDetail = focus.onShowTranslationDetail,
            onFlagTap = callbacks.onFlagTap,
            onAddReaction = callbacks.onAddReaction,
            onReactionToggle = callbacks.onReactionClick,
            onReactionWho = callbacks.onReactionLongPress,
            onMessageInfo = focus.onShowMessageInfo,
        ),
        status = {
            if (content.isOutgoing && content.deliveryStatus != DeliveryStatus.Failed) {
                DeliveryStatusIcon(
                    status = content.deliveryStatus,
                    metaColor = metaTint,
                    isSlow = content.isSlowSend,
                    readTintOverride = readTint,
                )
            }
        },
    )
}
