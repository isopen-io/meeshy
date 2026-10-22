package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.time.ZoneId
import java.util.Locale
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.ShareLinkDateFormat
import me.meeshy.sdk.model.ShareLinkEditDraft
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.chrome.MeeshyCard
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le formulaire d'édition d'un lien (#7797). Il couvre TOUS les champs que `PATCH /links/:linkId`
 * accepte et que la carte « Configuration » montre : nom interne, message d'invitation,
 * expiration, utilisations max, personnes en même temps, conditions d'entrée, langues autorisées,
 * droits des invités. Il n'écrit que le BROUILLON ; « Enregistrer » le confie au ViewModel.
 * Miroir de `ShareLinkEditForm` (iOS).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ShareLinkEditForm(
    draft: ShareLinkEditDraft,
    isActive: Boolean,
    canSave: Boolean,
    isSaving: Boolean,
    nowMillis: Long,
    onDraftChange: (ShareLinkEditDraft) -> Unit,
    onSave: () -> Unit,
    onToggleActive: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        Text(
            text = stringResource(R.string.shareLink_detail_editTitle),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.ExtraBold,
            color = MeeshyTheme.tokens.textPrimary,
        )

        FormGroup {
            OutlinedTextField(
                value = draft.name,
                onValueChange = { onDraftChange(draft.copy(name = it)) },
                label = { Text(stringResource(R.string.shareLink_detail_nameField)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = draft.description,
                onValueChange = { onDraftChange(draft.copy(description = it)) },
                label = { Text(stringResource(R.string.shareLink_detail_messageField)) },
                minLines = 2,
                maxLines = 6,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        SectionTitle(stringResource(R.string.shareLink_detail_limits))
        FormGroup {
            SwitchRow(
                label = stringResource(R.string.shareLink_detail_expiration),
                checked = draft.expiresAt != null,
                onCheckedChange = { onDraftChange(draft.withExpiryEnabled(it, nowMillis)) },
            )
            ExpiryPicker(draft = draft, onDraftChange = onDraftChange)
            LimitField(
                label = stringResource(R.string.shareLink_detail_maxUsesField),
                value = draft.maxUses,
                onInput = { onDraftChange(draft.withMaxUsesInput(it)) },
            )
            LimitField(
                label = stringResource(R.string.shareLink_detail_maxConcurrentField),
                value = draft.maxConcurrentUsers,
                onInput = { onDraftChange(draft.withMaxConcurrentInput(it)) },
            )
            if (!draft.isValid) {
                Text(
                    text = stringResource(R.string.shareLink_detail_invalidLimits),
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.error,
                )
            }
        }

        SectionTitle(stringResource(R.string.shareLink_detail_entryConditions))
        FormGroup {
            SwitchRow(stringResource(R.string.shareLink_detail_requireAccount), draft.requireAccount) {
                onDraftChange(draft.copy(requireAccount = it))
            }
            SwitchRow(stringResource(R.string.shareLink_detail_requireNickname), draft.requireNickname) {
                onDraftChange(draft.copy(requireNickname = it))
            }
            SwitchRow(stringResource(R.string.shareLink_detail_requireEmail), draft.requireEmail) {
                onDraftChange(draft.copy(requireEmail = it))
            }
            SwitchRow(stringResource(R.string.shareLink_detail_requireBirthday), draft.requireBirthday) {
                onDraftChange(draft.copy(requireBirthday = it))
            }
        }

        SectionTitle(stringResource(R.string.shareLink_detail_allowedLanguages))
        FormGroup {
            SwitchRow(stringResource(R.string.shareLink_detail_allLanguages), draft.allowsAllLanguages) { all ->
                onDraftChange(draft.withAllLanguages(all, Locale.getDefault().language.ifEmpty { "fr" }))
            }
            if (!draft.allowsAllLanguages) {
                val selectedLabel = stringResource(R.string.sharelinks_detail_language_selected)
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                ) {
                    draft.languageChoices.forEach { code ->
                        val selected = code in draft.allowedLanguages
                        FilterChip(
                            selected = selected,
                            onClick = { onDraftChange(draft.toggleLanguage(code)) },
                            label = { Text(LanguageData.autonym(code), maxLines = 1) },
                            modifier = Modifier
                                .heightIn(min = 48.dp)
                                .semantics { if (selected) stateDescription = selectedLabel },
                        )
                    }
                }
            }
        }

        SectionTitle(stringResource(R.string.shareLink_detail_guestRights))
        FormGroup {
            SwitchRow(stringResource(R.string.share_link_permission_messages), draft.allowMessages) {
                onDraftChange(draft.copy(allowMessages = it))
            }
            SwitchRow(stringResource(R.string.shareLink_detail_historyRight), draft.allowHistory) {
                onDraftChange(draft.copy(allowHistory = it))
            }
            SwitchRow(stringResource(R.string.share_link_permission_images), draft.allowImages) {
                onDraftChange(draft.copy(allowImages = it))
            }
            SwitchRow(stringResource(R.string.share_link_permission_files), draft.allowFiles) {
                onDraftChange(draft.copy(allowFiles = it))
            }
        }

        FormActions(
            isActive = isActive,
            canSave = canSave,
            isSaving = isSaving,
            onSave = onSave,
            onToggleActive = onToggleActive,
            onDelete = onDelete,
        )
    }
}

@Composable
private fun FormGroup(content: @Composable () -> Unit) {
    MeeshyCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) { content() }
    }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f),
        )
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

/** Un champ numérique où VIDE veut dire « illimité » — la valeur que la passerelle reçoit en `null` explicite. */
@Composable
private fun LimitField(label: String, value: Int?, onInput: (String) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f),
        )
        OutlinedTextField(
            value = value?.toString().orEmpty(),
            onValueChange = onInput,
            placeholder = { Text(stringResource(R.string.shareLink_detail_unlimited), textAlign = TextAlign.End) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            textStyle = MaterialTheme.typography.bodyMedium.copy(textAlign = TextAlign.End),
            modifier = Modifier.size(width = 132.dp, height = 56.dp),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ExpiryPicker(draft: ShareLinkEditDraft, onDraftChange: (ShareLinkEditDraft) -> Unit) {
    val expiresAt = isoToEpochMillisOrNull(draft.expiresAt) ?: return
    var open by remember { mutableStateOf(false) }
    TextButton(onClick = { open = true }, modifier = Modifier.heightIn(min = 48.dp)) {
        Text("${stringResource(R.string.shareLink_detail_expires)} · ${ShareLinkDateFormat.dayAndTime(expiresAt)}")
    }
    if (open) {
        val state = rememberDatePickerState(initialSelectedDateMillis = expiresAt)
        DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { onDraftChange(draft.withExpiryDay(it, ZoneId.systemDefault())) }
                    open = false
                }) { Text(stringResource(R.string.shareLink_detail_save)) }
            },
            dismissButton = {
                TextButton(onClick = { open = false }) { Text(stringResource(R.string.common_cancel)) }
            },
        ) { DatePicker(state = state) }
    }
}

@Composable
private fun FormActions(
    isActive: Boolean,
    canSave: Boolean,
    isSaving: Boolean,
    onSave: () -> Unit,
    onToggleActive: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Button(
            onClick = onSave,
            enabled = canSave,
            colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 54.dp),
        ) {
            if (isSaving) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp,
                    color = MeeshyTheme.tokens.textPrimary,
                )
            } else {
                Text(stringResource(R.string.shareLink_detail_save), fontWeight = FontWeight.ExtraBold)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(
                onClick = onToggleActive,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp),
            ) {
                Text(
                    stringResource(if (isActive) R.string.share_link_detail_disable else R.string.share_link_detail_activate),
                    color = if (isActive) MeeshyTheme.tokens.warning else MeeshyTheme.tokens.success,
                    fontWeight = FontWeight.Bold,
                )
            }
            OutlinedButton(
                onClick = onDelete,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp),
            ) {
                Text(
                    stringResource(R.string.share_link_detail_delete_confirm),
                    color = MeeshyTheme.tokens.error,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}
