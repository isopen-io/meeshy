package me.meeshy.app.chat

import androidx.compose.foundation.clickable
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
        OutlinedTextField(
            value = fieldValue,
            onValueChange = onFieldChange,
            modifier = Modifier.weight(1f),
            placeholder = { Text(stringResource(R.string.chat_message_placeholder)) },
            maxLines = 4,
            // The keyboard's action key reads « Send » and sends, like iOS (`ComposerReturnKey`):
            // the field empties on send through the controller's draft reset.
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Sentences,
                imeAction = ImeAction.Send,
            ),
            keyboardActions = KeyboardActions(onSend = { if (!showMic && sendEnabled) onSend() }),
            trailingIcon = if (sentiment != null) {
                {
                    val description = stringResource(R.string.chat_composer_sentiment)
                    Text(
                        text = sentiment.emoji,
                        modifier = Modifier.semantics { contentDescription = description },
                    )
                }
            } else {
                null
            },
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
            IconButton(onClick = onSend, enabled = sendEnabled) {
                Icon(
                    imageVector = if (isEditing) Icons.Filled.Check else Icons.AutoMirrored.Filled.Send,
                    contentDescription = stringResource(R.string.chat_send),
                    tint = when {
                        !sendEnabled -> MeeshyTheme.tokens.textSecondary.copy(alpha = 0.5f)
                        isEditing -> MeeshyTheme.tokens.warning
                        else -> accentColor
                    },
                )
            }
        }
    }
}

/**
 * The composer's live language pill — the "smart context zone" affordance. Shows
 * the flag of the resolved source language ([ChatUiState.composerLanguageCode]),
 * following on-device detection as the viewer types, and opens a picker so they can
 * override it (long messages lock the detection, exactly like iOS). Thin,
 * coverage-exempt Compose glue over the pure [me.meeshy.sdk.model.ComposerLanguageState];
 * the picker offers the curated [LanguageData.commonLanguageCodes] set.
 */
@Composable
internal fun ComposerLanguagePill(
    languageCode: String,
    accentColor: Color,
    onPick: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val description = stringResource(R.string.chat_composer_language)
    Box {
        Text(
            text = ComposerLanguage.flag(languageCode),
            modifier = Modifier
                .clip(RoundedCornerShape(MeeshySpacing.sm))
                .clickable { expanded = true }
                .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs)
                .semantics { contentDescription = description },
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            LanguageData.commonLanguageCodes.forEach { code ->
                val info = LanguageData.info(code) ?: return@forEach
                DropdownMenuItem(
                    text = { Text("${info.flag}  ${info.nativeName}") },
                    onClick = {
                        expanded = false
                        onPick(code)
                    },
                    trailingIcon = if (code == languageCode) {
                        {
                            Icon(
                                imageVector = Icons.Filled.Check,
                                contentDescription = null,
                                tint = accentColor,
                            )
                        }
                    } else {
                        null
                    },
                )
            }
        }
    }
}

