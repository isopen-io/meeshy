package me.meeshy.app.notifications

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.NotificationRowFooter
import me.meeshy.sdk.model.RowContentKind
import me.meeshy.ui.format.RelativeTimeStrings
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Le texte du pied tel que l'œil ET TalkBack le lisent : extrait (ou nature), date de publication, expiration. */
@Composable
internal fun rememberFooterText(footer: NotificationRowFooter?): String? {
    if (footer == null) return null
    val strings = rememberRelativeTimeStrings()
    val kindLabel = (footer as? NotificationRowFooter.Content)?.kind?.let { stringResource(it.labelRes()) }
    val expired = stringResource(R.string.notifications_footer_expired)
    return remember(footer, strings, kindLabel, expired) { footerText(footer, strings, kindLabel, expired) }
}

internal fun footerText(
    footer: NotificationRowFooter,
    strings: RelativeTimeStrings,
    kindLabel: String?,
    expiredLabel: String,
): String = when (footer) {
    is NotificationRowFooter.Conversation -> footer.title
    is NotificationRowFooter.Plain -> footer.text
    is NotificationRowFooter.Content -> listOfNotNull(
        footer.excerpt ?: kindLabel,
        footer.publishedAtMillis?.let { NotificationRowTime.short(it, strings) },
        expiredLabel.takeIf { footer.isExpired },
    ).joinToString(" · ")
}

/** Le pied de rangée : OÙ ça s'est passé — icône de genre + une ligne discrète ; expiré, il passe en rouge. */
@Composable
internal fun NotificationRowFooterLine(footer: NotificationRowFooter, text: String, modifier: Modifier = Modifier) {
    val expired = (footer as? NotificationRowFooter.Content)?.isExpired == true
    val tint = if (expired) MeeshyPalette.Error else MeeshyTheme.tokens.textMuted
    val icon = footer.icon()
    Row(
        modifier = modifier.padding(top = MeeshySpacing.xxs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(12.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = tint, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

private fun NotificationRowFooter.icon(): ImageVector? = when (this) {
    is NotificationRowFooter.Conversation -> MeeshyIcons.Forum
    is NotificationRowFooter.Plain -> null
    is NotificationRowFooter.Content -> if (isExpired) MeeshyIcons.TimerOff else kind.icon()
}

private fun RowContentKind.icon(): ImageVector = when (this) {
    RowContentKind.STORY -> MeeshyIcons.PlayCircle
    RowContentKind.REEL -> MeeshyIcons.Movie
    RowContentKind.MOOD -> MeeshyIcons.Emoji
    RowContentKind.POST -> MeeshyIcons.Article
}

@androidx.annotation.StringRes
internal fun RowContentKind.labelRes(): Int = when (this) {
    RowContentKind.STORY -> R.string.notifications_footer_story
    RowContentKind.REEL -> R.string.notifications_footer_reel
    RowContentKind.MOOD -> R.string.notifications_footer_mood
    RowContentKind.POST -> R.string.notifications_footer_post
}
