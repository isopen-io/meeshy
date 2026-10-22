package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The tappable "share something with the world" row above the post list — iOS parity:
 * `FeedView.composerPlaceholder`. Deliberately simpler than iOS's version (no live
 * avatar or "+" attachment menu — this first sub-slice is text-only, see
 * [FeedComposerSheet]'s own doc comment for the deferred follow-ups) — a rounded
 * input-styled row that opens the composer sheet on tap.
 */
@Composable
internal fun FeedComposerPlaceholder(onClick: () -> Unit) {
    val a11yLabel = stringResource(R.string.feed_composer_open_label)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg)
            .padding(bottom = MeeshySpacing.sm)
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(MeeshyTheme.tokens.inputBackground)
            .border(1.dp, MeeshyTheme.tokens.inputBorder, RoundedCornerShape(MeeshyRadius.lg))
            .clickable(onClick = onClick)
            .semantics {
                contentDescription = a11yLabel
                role = Role.Button
            }
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(R.string.feed_composer_open_placeholder),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textMuted,
        )
    }
}
