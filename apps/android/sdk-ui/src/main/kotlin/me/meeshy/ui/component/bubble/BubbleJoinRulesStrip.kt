package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.JoinNoticeMetadata
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Ce que le lien d'entrée autorise à l'arrivant, en trois glyphes : écrire, joindre un fichier,
 * envoyer une photo (iOS `JoinNoticeRulesStrip`). Un droit accordé est teinté, un droit refusé
 * reste éteint — l'œil lit la rangée d'un coup, TalkBack dit chaque règle en toutes lettres.
 */
@Composable
internal fun BubbleJoinRulesStrip(rules: JoinNoticeMetadata.LinkRules, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        RuleGlyph(
            icon = MeeshyIcons.ChatBubble,
            allowed = rules.canSendMessages,
            label = stringResource(
                if (rules.canSendMessages) R.string.bubble_joinNotice_rule_messages_allowed
                else R.string.bubble_joinNotice_rule_messages_denied,
            ),
        )
        RuleGlyph(
            icon = MeeshyIcons.AttachFile,
            allowed = rules.canSendFiles,
            label = stringResource(
                if (rules.canSendFiles) R.string.bubble_joinNotice_rule_files_allowed
                else R.string.bubble_joinNotice_rule_files_denied,
            ),
        )
        RuleGlyph(
            icon = MeeshyIcons.Photo,
            allowed = rules.canSendImages,
            label = stringResource(
                if (rules.canSendImages) R.string.bubble_joinNotice_rule_images_allowed
                else R.string.bubble_joinNotice_rule_images_denied,
            ),
        )
    }
}

@Composable
private fun RuleGlyph(icon: ImageVector, allowed: Boolean, label: String) {
    val muted = MeeshyTheme.tokens.textMuted
    Icon(
        imageVector = icon,
        contentDescription = label,
        tint = if (allowed) MeeshyPalette.Purple700 else muted.copy(alpha = muted.alpha * 0.5f),
        modifier = Modifier.size(12.dp),
    )
}
