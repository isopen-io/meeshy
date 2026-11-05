package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.translation.AudioTranslationRequestState
import me.meeshy.sdk.model.settings.SettingsInvite
import me.meeshy.ui.component.audio.AudioConsentNotice
import me.meeshy.ui.settings.rememberSettingsInvite
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.R as UiR

/** L'étiquette de test d'une ligne de la feuille, par code de langue. */
internal fun audioTranslationRowTag(language: String): String = "audioTranslationRow-$language"

/**
 * **La feuille « Traduire l'audio »** (iOS `audio.fullscreen.language.choose`) : une ligne par langue proposée, le spinner de
 * la langue demandée, la piste jouable dès qu'elle arrive (un toucher la joue), la notice de consentement au clonage vocal
 * sur un 403 de consentement — jamais une erreur générique —, le refus de chiffrement dit sans requête. L'accent est celui de
 * la conversation, passé en paramètre.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AudioTranslationSheet(
    input: AudioTranslationSheetInput,
    accentColor: Color,
    onPlayTrack: (messageId: String, language: String) -> Unit,
    onOpenConsent: (() -> Unit)?,
    onDismiss: () -> Unit,
    viewModel: AudioTranslationSheetViewModel = hiltViewModel(),
) {
    LaunchedEffect(input) { viewModel.bind(input) }
    LaunchedEffect(viewModel) {
        viewModel.effect.collect { effect ->
            when (effect) {
                is AudioTranslationSheetEffect.PlayTrack -> {
                    onPlayTrack(effect.messageId, effect.language)
                    onDismiss()
                }
            }
        }
    }
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = MeeshyTheme.tokens.backgroundPrimary) {
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Text(
                text = stringResource(R.string.audio_fullscreen_language_choose),
                style = MaterialTheme.typography.titleMedium,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.padding(vertical = MeeshySpacing.sm),
            )
            state.consent?.let { ConsentNotice(accentColor, onOpenConsent) }
            state.rows.forEach { row ->
                AudioTranslationRowView(row, accentColor, onClick = { viewModel.onEvent(AudioTranslationSheetEvent.Tap(row.language)) })
            }
        }
    }
}

@Composable
private fun ConsentNotice(accentColor: Color, onOpenConsentOverride: (() -> Unit)?) {
    val message = stringResource(UiR.string.audio_consent_notice_message)
    // #16339 — sans geste fourni par l'hôte, l'invite ouvre les Réglages sur le profil vocal, mis en évidence.
    val onOpenConsent = onOpenConsentOverride ?: rememberSettingsInvite(SettingsInvite.VOICE_CONSENT)
    if (onOpenConsent == null) {
        Text(text = message, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textMuted)
        return
    }
    AudioConsentNotice(
        message = message,
        actionTitle = stringResource(UiR.string.audio_consent_notice_action),
        accentHex = accentColor.voiceHex(),
        onTap = onOpenConsent,
    )
}

@Composable
private fun AudioTranslationRowView(row: AudioTranslationRow, accentColor: Color, onClick: () -> Unit) {
    val info = LanguageData.info(row.language)
    val name = info?.nativeName ?: row.language
    val haptics = rememberMeeshyHaptics()
    val tappable = row.state is AudioTranslationRequestState.Idle || row.state is AudioTranslationRequestState.Failed ||
        row.state is AudioTranslationRequestState.Ready || row.state is AudioTranslationRequestState.ConsentRequired
    Column(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .clip(RoundedCornerShape(MeeshyRadius.sm))
                .background(if (row.state is AudioTranslationRequestState.Ready) accentColor.copy(alpha = 0.10f) else Color.Transparent)
                .clickable(enabled = tappable) {
                    haptics.light()
                    onClick()
                }
                .semantics {
                    role = Role.Button
                    contentDescription = name
                    testTag = audioTranslationRowTag(row.language)
                }
                .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Text(text = info?.flag ?: row.language.uppercase(), style = MaterialTheme.typography.labelLarge)
            Text(text = name, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
            Spacer(Modifier.weight(1f))
            RowTrailing(row.state, accentColor)
        }
        StateCaption(row.state)
    }
}

@Composable
private fun RowTrailing(state: AudioTranslationRequestState, accent: Color) {
    when (state) {
        is AudioTranslationRequestState.InFlight ->
            CircularProgressIndicator(color = accent, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
        AudioTranslationRequestState.Ready ->
            Icon(MeeshyIcons.Check, contentDescription = null, tint = accent, modifier = Modifier.size(18.dp))
        AudioTranslationRequestState.Failed ->
            Icon(
                MeeshyIcons.Refresh,
                contentDescription = stringResource(R.string.chat_explorer_retranslate),
                tint = accent.copy(alpha = 0.8f),
                modifier = Modifier.size(18.dp),
            )
        AudioTranslationRequestState.Idle, is AudioTranslationRequestState.ConsentRequired ->
            Text(
                text = stringResource(R.string.chat_explorer_translate),
                style = MaterialTheme.typography.labelMedium,
                color = accent,
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .background(accent.copy(alpha = 0.12f))
                    .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
            )
        AudioTranslationRequestState.Refused -> Unit
    }
}

@Composable
private fun StateCaption(state: AudioTranslationRequestState) {
    val caption = when (state) {
        AudioTranslationRequestState.Failed -> R.string.translation_audio_error
        AudioTranslationRequestState.Refused -> R.string.message_translation_e2ee_serverRefused
        else -> return
    }
    Text(
        text = stringResource(caption),
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyTheme.tokens.textMuted,
        modifier = Modifier.padding(horizontal = MeeshySpacing.sm),
    )
}
