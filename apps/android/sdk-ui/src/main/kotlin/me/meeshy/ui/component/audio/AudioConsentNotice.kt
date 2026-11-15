package me.meeshy.ui.component.audio

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

const val AUDIO_CONSENT_NOTICE_TAG: String = "audioConsentNotice"

/** Le libellé que TalkBack lit : « message. action », en UN seul nœud (miroir de `accessibilityLabel("\(message). \(actionTitle)")`). */
fun audioConsentNoticeDescription(message: String, actionTitle: String): String = "$message. $actionTitle"

/**
 * Note inline discrète invitant à activer le consentement vocal — miroir de `AudioConsentNotice` (iOS). Atome : paramètres opaques,
 * aucune décision produit, ni modale ni bannière. [accentHex] est l'accent de la conversation, calculé par l'appelant.
 */
@Composable
fun AudioConsentNotice(
    message: String,
    actionTitle: String,
    accentHex: String,
    onTap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val accent = hexColor(accentHex, MeeshyTheme.tokens.textSecondary)
    val shape = RoundedCornerShape(MeeshyRadius.sm)
    val description = audioConsentNoticeDescription(message, actionTitle)
    MeeshyGlassSurface(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .border(1.dp, accent.copy(alpha = 0.4f), shape)
            .clickable(onClick = onTap)
            .clearAndSetSemantics {
                contentDescription = description
                role = Role.Button
                testTag = AUDIO_CONSENT_NOTICE_TAG
                onClick(label = actionTitle) {
                    onTap()
                    true
                }
            },
        shape = shape,
        tint = accent,
    ) {
        Row(
            modifier = Modifier
                .heightIn(min = 48.dp)
                .padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.smPlus),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Icon(MeeshyIcons.MicOff, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(14.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                Text(
                    text = message,
                    color = MeeshyTheme.tokens.textSecondary,
                    fontSize = MeeshyFontSize.small,
                    textAlign = TextAlign.Start,
                )
                Text(
                    text = actionTitle,
                    color = accent,
                    fontSize = MeeshyFontSize.footnote,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Icon(MeeshyIcons.ChevronForward, contentDescription = null, tint = accent, modifier = Modifier.size(14.dp))
        }
    }
}
