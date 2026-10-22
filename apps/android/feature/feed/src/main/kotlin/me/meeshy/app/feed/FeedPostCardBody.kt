package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.bubble.LanguageChip
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * Corps de la carte : texte du post (sélectionnable) puis bandeau de langues du Prisme.
 */
@Composable
internal fun FeedPostCardBody(
    post: FeedPostPresentation,
    onFlagTap: (String) -> Unit,
) {
    if (post.content.isNotBlank()) {
        Spacer(Modifier.height(MeeshySpacing.md))
        SelectionContainer {
            Text(
                text = post.content,
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textPrimary,
            )
        }
    }

    if (post.languageStrip.isNotEmpty()) {
        Spacer(Modifier.height(MeeshySpacing.xs))
        PostLanguageStripRow(chips = post.languageStrip, onChipTap = onFlagTap)
    }
}

/**
 * Discrete Prisme flag strip under a translated post — the post's original language
 * plus each configured content language that has content, projected by
 * [me.meeshy.ui.component.bubble.PostLanguageStrip]. A lead-in translate glyph keeps
 * the row legible as a translation indicator; the active language reads its native
 * name in its own accent colour, the others show flag-only. Read-only (feed cards
 * do not switch language inline), mirroring the chat bubble's read-only strip.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun PostLanguageStripRow(
    chips: List<LanguageChip>,
    onChipTap: (String) -> Unit,
) {
    FlowRow(
        verticalArrangement = Arrangement.Center,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(
            imageVector = Icons.Filled.Translate,
            contentDescription = stringResource(R.string.feed_translated),
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(14.dp),
        )
        chips.forEach { chip ->
            val info = chip.info
            val accent = info?.colorHex
                ?.let(::hexColor)
                ?.takeIf { it != Color.Unspecified }
                ?: MeeshyTheme.tokens.textSecondary
            val flag = info?.flag ?: chip.code.uppercase()
            val label = info?.name ?: chip.code
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .background(
                        if (chip.isActive) accent.copy(alpha = 0.16f) else Color.Transparent,
                    )
                    .clickable { onChipTap(chip.code) }
                    .padding(horizontal = 6.dp, vertical = 2.dp)
                    .semantics(mergeDescendants = true) { contentDescription = label },
            ) {
                Text(text = flag, style = MaterialTheme.typography.labelSmall)
                if (chip.isActive && info != null) {
                    Text(
                        text = info.nativeName,
                        style = MaterialTheme.typography.labelSmall,
                        color = accent,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(start = 3.dp),
                    )
                }
            }
        }
    }
}
