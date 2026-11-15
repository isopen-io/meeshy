package me.meeshy.app.feed

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * Le panneau de traduction secondaire du détail d'un post (iOS
 * `PostDetailSecondaryTranslationPanel`) : un filet coloré par langue, le drapeau et le nom, puis
 * le texte traduit sous le texte lu. Apparaît et disparaît en déroulant, comme la transition iOS
 * (fondu + déplacement depuis le haut).
 */
@Composable
internal fun PostSecondaryTranslationPanel(translation: PostSecondaryTranslation?, modifier: Modifier = Modifier) {
    AnimatedVisibility(
        visible = translation != null,
        enter = expandVertically() + fadeIn(),
        exit = shrinkVertically() + fadeOut(),
        modifier = modifier,
    ) {
        translation?.let { PanelBody(it) }
    }
}

@Composable
private fun PanelBody(translation: PostSecondaryTranslation) {
    val tint = translation.info?.colorHex?.let(::hexColor)?.takeIf { it != Color.Unspecified }
        ?: MeeshyTheme.tokens.textSecondary
    val name = translation.info?.name ?: translation.code
    val spoken = stringResource(R.string.feed_secondary_translation_a11y, name, translation.content)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.xs)
            .semantics(mergeDescendants = true) { contentDescription = spoken },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Column(Modifier.weight(1f).height(1.dp).background(tint.copy(alpha = 0.4f))) {}
            Column(Modifier.size(4.dp).clip(CircleShape).background(tint)) {}
            Column(Modifier.weight(1f).height(1.dp).background(tint.copy(alpha = 0.4f))) {}
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(MeeshyRadius.sm))
                .background(tint.copy(alpha = 0.08f))
                .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.sm),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                Text(text = translation.info?.flag ?: translation.code.uppercase(), style = MaterialTheme.typography.labelMedium)
                Text(text = name, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = tint)
            }
            Text(
                text = translation.content,
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textPrimary.copy(alpha = 0.8f),
            )
        }
    }
}
