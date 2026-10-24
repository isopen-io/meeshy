package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/**
 * Text decorations the host resolves for the bubble body: mention display names, the search
 * highlight term and the tracked-link map. All optional; null means "no decoration".
 */
internal class BubbleTextDecor(
    val mentionDisplayNames: Map<String, String>?,
    val highlightTerm: String?,
    val trackedLinks: Map<String, String>?,
)

/**
 * The text body of a standard bubble. A deleted message reads the italic "Message deleted"
 * tombstone; otherwise the text renders when non-blank or when there is no attachment to carry
 * the bubble — as large free emoji for an emoji-only message (centered under a quote), else as
 * rich text (mentions, links, search highlight).
 */
@Composable
internal fun ColumnScope.BubbleTextBody(
    content: BubbleContent,
    onColor: Color,
    decor: BubbleTextDecor,
) {
    if (content.isDeleted) {
        Text(
            text = stringResource(R.string.bubble_message_deleted),
            style = MaterialTheme.typography.bodyMedium,
            fontStyle = FontStyle.Italic,
            color = onColor.copy(alpha = 0.6f),
        )
    } else if (content.text.isNotBlank() || !content.hasRenderedAttachments) {
        val emojiFontSize = EmojiDetector.fontSizeSp(content.emojiOnlyCount)
        if (emojiFontSize != null) {
            Text(
                text = content.text,
                fontSize = emojiFontSize.sp,
                lineHeight = (emojiFontSize + 8).sp,
                modifier = if (content.replyToText != null) {
                    Modifier.align(Alignment.CenterHorizontally)
                } else {
                    Modifier
                },
            )
        } else {
            RichMessageText(
                text = content.text,
                color = onColor,
                style = MaterialTheme.typography.bodyMedium,
                highlightColor = MeeshyPalette.Warning.copy(alpha = 0.45f),
                mentionDisplayNames = decor.mentionDisplayNames,
                highlightTerm = decor.highlightTerm,
                trackedLinks = decor.trackedLinks,
            )
        }
    }
}

/**
 * Discrete Prisme flag strip under a translated bubble — the original language
 * plus each configured content language that has content, projected by
 * [MessageLanguageStrip]. The active language reads its native name in its own
 * accent colour; the others show flag-only. When [onFlagTap] is present each chip
 * is tappable to switch the bubble's displayed language (the active flag reverts
 * to the default resolution); without it the strip stays a read-only indicator.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun LanguageStrip(
    chips: List<LanguageChip>,
    onColor: Color,
    modifier: Modifier = Modifier,
    onFlagTap: ((String) -> Unit)? = null,
) {
    FlowRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        chips.forEach { chip ->
            LanguageStripChip(chip = chip, onColor = onColor, onFlagTap = onFlagTap)
        }
    }
}

@Composable
private fun LanguageStripChip(
    chip: LanguageChip,
    onColor: Color,
    onFlagTap: ((String) -> Unit)?,
) {
    val accent = chip.info?.colorHex
        ?.let(::hexColor)
        ?.takeIf { it != Color.Unspecified }
        ?: onColor
    val flag = chip.info?.flag ?: chip.code.uppercase()
    val label = chip.info?.name ?: chip.code
    // A translatable chip (a configured language with no content yet) reads
    // as a dimmed flag with a "+" affordance — tapping requests it. Content
    // chips render at full strength; the active one shows its native name.
    val flagAlpha = if (chip.isTranslatable) 0.55f else 1f
    val chipLabel = if (chip.isTranslatable) "$label — translate" else label
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(
                if (chip.isActive) accent.copy(alpha = 0.16f) else Color.Transparent,
            )
            .let { base ->
                if (onFlagTap == null) base
                else base
                    .clickable { onFlagTap(chip.code) }
                    .semantics { role = Role.Button }
            }
            .padding(horizontal = 6.dp, vertical = 2.dp)
            .semantics(mergeDescendants = true) { contentDescription = chipLabel },
    ) {
        Text(
            text = flag,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.alpha(flagAlpha),
        )
        if (chip.isTranslatable) {
            Text(
                text = "+",
                style = MaterialTheme.typography.labelSmall,
                color = onColor.copy(alpha = 0.7f),
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 2.dp),
            )
        } else if (chip.isActive && chip.info != null) {
            Text(
                text = chip.info.nativeName,
                style = MaterialTheme.typography.labelSmall,
                color = accent,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 3.dp),
            )
        }
    }
}
