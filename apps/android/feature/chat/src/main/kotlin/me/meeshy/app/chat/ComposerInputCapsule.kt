package me.meeshy.app.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.message.MessageComposerCapsule
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le champ de saisie, capsule de VERRE (iOS `textInputField`) : rayon 22, 44 dp au minimum, 1 à 5
 * lignes en police 16. Le micro vit DANS le champ, à gauche, et s'efface au focus. Au repos le
 * liseré liquide, au focus la bordure 1,5 en dégradé accent -> indigo 600 et une échelle 1,02.
 * La touche Retour envoie jusqu'à sept mots, puis redevient un retour à la ligne.
 * La capsule elle-même est [MessageComposerCapsule] (:sdk-ui), partagée avec les commentaires (#13988).
 */
@Composable
internal fun ComposerInputCapsule(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    accentColor: Color,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
    showMic: Boolean = false,
    iconTint: Color = MeeshyTheme.tokens.textSecondary,
    protectionTint: Color? = null,
    onRequestVoice: () -> Unit = {},
    focusRequester: FocusRequester = remember { FocusRequester() },
    onFocusChange: (Boolean) -> Unit = {},
) {
    val micLabel = stringResource(R.string.chat_record_voice)
    MessageComposerCapsule(
        value = value,
        onValueChange = onValueChange,
        accentColor = accentColor,
        placeholder = stringResource(R.string.chat_message_placeholder),
        onSend = onSend,
        modifier = modifier,
        protectionTint = protectionTint,
        leading = if (showMic) {
            {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .clickable(role = Role.Button, onClick = onRequestVoice)
                        .semantics { contentDescription = micLabel },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(MeeshyIcons.Mic, contentDescription = null, tint = iconTint, modifier = Modifier.size(19.dp))
                }
            }
        } else {
            null
        },
        focusRequester = focusRequester,
        onFocusChange = onFocusChange,
    )
}
