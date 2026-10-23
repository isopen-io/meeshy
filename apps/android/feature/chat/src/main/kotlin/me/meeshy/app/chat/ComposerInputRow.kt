package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyGradients
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.ComposerLanguage
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.SentimentLevel
import androidx.compose.ui.focus.FocusRequester
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The composer's input line: attach toggle, effects, language pill, text field and the
 * mic / send control. Everything it shows arrives as a parameter.
 */
@Composable
internal fun ComposerInputRow(
    isEditing: Boolean,
    hasAttachmentTiles: Boolean,
    attachmentTrayOpen: Boolean,
    hasEffects: Boolean,
    languageCode: String,
    fieldValue: TextFieldValue,
    sentiment: SentimentLevel?,
    showMic: Boolean,
    sendEnabled: Boolean,
    accentColor: Color,
    onToggleTray: () -> Unit,
    onOpenEffects: () -> Unit,
    onPickLanguage: (String) -> Unit,
    onFieldChange: (TextFieldValue) -> Unit,
    onRequestVoice: () -> Unit,
    onSend: () -> Unit,
    secondaryColor: Color = MeeshyPalette.Indigo600,
    focusRequester: FocusRequester = remember { FocusRequester() },
    onFocusChange: (Boolean) -> Unit = {},
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (!isEditing) {
            if (hasAttachmentTiles) {
                IconButton(onClick = { onToggleTray() }) {
                    Icon(
                        imageVector = if (attachmentTrayOpen) Icons.Filled.Close else Icons.Filled.Add,
                        contentDescription = stringResource(R.string.chat_attach_open),
                        tint = if (attachmentTrayOpen) accentColor else MeeshyTheme.tokens.textSecondary,
                    )
                }
            }
            IconButton(onClick = onOpenEffects) {
                Icon(
                    imageVector = Icons.Filled.AutoAwesome,
                    contentDescription = stringResource(R.string.chat_effects_open),
                    tint = if (hasEffects) accentColor else MeeshyTheme.tokens.textSecondary,
                )
            }
            ComposerLanguagePill(
                languageCode = languageCode,
                accentColor = accentColor,
                onPick = onPickLanguage,
            )
        }
        ComposerInputCapsule(
            value = fieldValue,
            onValueChange = onFieldChange,
            accentColor = accentColor,
            sentiment = sentiment,
            onSend = { if (!showMic && sendEnabled) onSend() },
            modifier = Modifier.weight(1f),
            focusRequester = focusRequester,
            onFocusChange = onFocusChange,
        )
        if (showMic) {
            IconButton(onClick = onRequestVoice) {
                Icon(
                    imageVector = Icons.Filled.Mic,
                    contentDescription = stringResource(R.string.chat_record_voice),
                    tint = MeeshyTheme.tokens.textSecondary,
                )
            }
        } else {
            ComposerSendButton(
                isEditing = isEditing,
                enabled = sendEnabled,
                accentColor = accentColor,
                secondaryColor = secondaryColor,
                onSend = onSend,
            )
        }
    }
}

/**
 * Le bouton d'envoi : pastille au dégradé accent -> secondaire de la conversation. Le point
 * d'accroche [protectionTint] recevra la couleur de protection (lot composer-protections) ; il est
 * inerte ici.
 */
@Composable
internal fun ComposerSendButton(
    isEditing: Boolean,
    enabled: Boolean,
    accentColor: Color,
    secondaryColor: Color,
    onSend: () -> Unit,
    protectionTint: Color? = null,
) {
    val fill = when {
        !enabled -> Modifier.background(MeeshyTheme.tokens.textSecondary.copy(alpha = 0.25f), CircleShape)
        isEditing -> Modifier.background(MeeshyTheme.tokens.warning, CircleShape)
        protectionTint != null -> Modifier.background(protectionTint, CircleShape)
        else -> Modifier.background(MeeshyGradients.conversationAccent(accentColor, secondaryColor), CircleShape)
    }
    val label = stringResource(R.string.chat_send)
    IconButton(onClick = onSend, enabled = enabled, modifier = Modifier.size(44.dp)) {
        Box(modifier = Modifier.size(36.dp).then(fill), contentAlignment = Alignment.Center) {
            Icon(
                imageVector = if (isEditing) Icons.Filled.Check else Icons.AutoMirrored.Filled.Send,
                contentDescription = label,
                tint = Color.White,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}
