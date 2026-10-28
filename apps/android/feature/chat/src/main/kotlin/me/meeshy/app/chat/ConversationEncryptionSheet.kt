package me.meeshy.app.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.e2ee.ConversationEncryptionContent
import me.meeshy.sdk.model.e2ee.ConversationEncryptionExplanation
import me.meeshy.sdk.model.e2ee.ConversationEncryptionModeChoice
import me.meeshy.sdk.model.e2ee.ConversationEncryptionRegime
import me.meeshy.sdk.model.e2ee.ConversationEncryptionStatus
import me.meeshy.sdk.model.e2ee.ConversationEncryptionView
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/**
 * La fiche Chiffrement d'une conversation (iOS `ConversationEncryptionDetailSheet`, #13463) : le
 * régime dit sans jargon, qui peut lire, ce qui manque et pourquoi. Feuille : croix + glissé bas.
 * Le bout en bout ne se désactive jamais, et ne s'active pas depuis ce téléphone.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ConversationEncryptionSheet(
    conversationId: String,
    isDirect: Boolean,
    accentColor: Color,
    onDismiss: () -> Unit,
    viewModel: ConversationEncryptionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(conversationId) { viewModel.load(conversationId, isDirect) }
    val view = state.view()

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.xxl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            SheetHeader(stringResource(R.string.encryption_detail_title), onDismiss)
            when {
                state.isLoading -> LoadingBlock()
                state.readFailed -> ReadFailedBlock(state.notice, viewModel::retry)
                else -> {
                    StateBlock(view, state.status)
                    if (view.servedGap) NoticeText(R.string.encryption_detail_served_gap)
                    ConversationEncryptionExplanationSections(ConversationEncryptionExplanation.of(view.regime.wireMode(), isDirect))
                    when (val content = view.content) {
                        ConversationEncryptionContent.Activation -> ActivationBlock(state, accentColor, viewModel)
                        is ConversationEncryptionContent.Active -> if (content.offersDeactivation) DeactivationBlock(state.isSwitching, viewModel)
                        else -> Unit
                    }
                }
            }
            state.notice?.takeIf { !state.readFailed }?.let { NoticeText(it.textRes(), error = true) }
        }
    }
    if (state.confirmsDeactivation) DeactivationDialog(viewModel::confirmDeactivation, viewModel::cancelDeactivation)
}

private fun ConversationEncryptionRegime.wireMode(): String? = when (this) {
    ConversationEncryptionRegime.NONE -> null
    ConversationEncryptionRegime.SERVER -> "server"
    ConversationEncryptionRegime.HYBRID -> "hybrid"
    ConversationEncryptionRegime.END_TO_END -> "e2ee"
}

@Composable
internal fun SheetHeader(title: String, onClose: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        IconButton(onClick = onClose, modifier = Modifier.size(48.dp)) {
            Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.encryption_close), tint = MeeshyTheme.tokens.textSecondary)
        }
    }
}

@Composable
private fun LoadingBlock() {
    val label = stringResource(R.string.encryption_detail_loading)
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = MeeshyPalette.Indigo500)
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(label, color = MeeshyTheme.tokens.textMuted)
    }
}

@Composable
private fun ReadFailedBlock(notice: ConversationEncryptionNotice?, onRetry: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        NoticeText(notice?.textRes() ?: R.string.encryption_read_failed, error = true)
        TextButton(onClick = onRetry, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.encryption_retry)) }
    }
}

@Composable
private fun NoticeText(res: Int, error: Boolean = false) {
    Text(
        text = stringResource(res),
        style = MaterialTheme.typography.bodySmall,
        color = if (error) MeeshyPalette.Error else MeeshyTheme.tokens.textSecondary,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    )
}

@Composable
private fun StateBlock(view: ConversationEncryptionView, status: ConversationEncryptionStatus?) {
    val regime = view.regime
    val isEncrypted = regime != ConversationEncryptionRegime.NONE
    EncryptionStateCard(
        icon = regime.icon(),
        tint = if (regime == ConversationEncryptionRegime.END_TO_END) EncryptionSuccessTint else if (isEncrypted) MeeshyPalette.Indigo500 else EncryptionWarningTint,
        title = stringResource(if (isEncrypted) R.string.encryption_detail_active_label else R.string.encryption_detail_inactive_label),
        subtitle = stringResource(regime.summaryRes()),
    )
    if (!isEncrypted) return
    val locale = LocalConfiguration.current.locales[0]
    EncryptionDetailLine(stringResource(R.string.encryption_detail_mode_label), stringResource(regime.modeChoice().labelRes()))
    status?.enabledAt?.let { at ->
        val text = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withLocale(locale).withZone(ZoneId.systemDefault()).format(at)
        EncryptionDetailLine(stringResource(R.string.encryption_detail_enabled_on), text)
    }
    EncryptionDetailLine(
        stringResource(R.string.encryption_detail_translation),
        stringResource(
            when {
                regime == ConversationEncryptionRegime.END_TO_END -> R.string.encryption_detail_translation_on_device
                status?.canTranslate == true -> R.string.encryption_detail_translation_available
                else -> R.string.encryption_detail_translation_disabled
            },
        ),
    )
}

private fun ConversationEncryptionRegime.modeChoice(): ConversationEncryptionModeChoice = when (this) {
    ConversationEncryptionRegime.HYBRID -> ConversationEncryptionModeChoice.HYBRID
    ConversationEncryptionRegime.END_TO_END -> ConversationEncryptionModeChoice.E2EE
    else -> ConversationEncryptionModeChoice.SERVER
}

@Composable
private fun ActivationBlock(state: ConversationEncryptionUiState, accent: Color, viewModel: ConversationEncryptionViewModel) {
    Text(stringResource(R.string.encryption_detail_mode_header), style = MaterialTheme.typography.titleSmall, color = MeeshyTheme.tokens.textPrimary)
    ConversationEncryptionModeChoice.values().forEach { mode ->
        ModeRow(mode, selected = mode == state.selected, enabled = mode.isOfferedOnThisPhone && !state.isSwitching) { viewModel.select(mode) }
    }
    Text(
        stringResource(R.string.encryption_e2ee_unavailable_here),
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyTheme.tokens.textMuted,
    )
    Text(stringResource(R.string.encryption_detail_activation_footer_final), style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textMuted)
    Button(
        onClick = viewModel::activate,
        enabled = !state.isSwitching,
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
    ) {
        if (state.isSwitching) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = accent)
        else Text(stringResource(R.string.encryption_detail_activate))
    }
}

@Composable
private fun ModeRow(mode: ConversationEncryptionModeChoice, selected: Boolean, enabled: Boolean, onSelect: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clickable(enabled = enabled, role = Role.RadioButton, onClick = onSelect),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected && enabled, onClick = null, enabled = enabled)
        Spacer(Modifier.width(MeeshySpacing.sm))
        Column {
            Text(stringResource(mode.labelRes()), style = MaterialTheme.typography.bodyMedium, color = if (enabled) MeeshyTheme.tokens.textPrimary else MeeshyTheme.tokens.textMuted)
            Text(stringResource(mode.descriptionRes()), style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textMuted)
        }
    }
}

@Composable
private fun DeactivationBlock(isSwitching: Boolean, viewModel: ConversationEncryptionViewModel) {
    TextButton(onClick = viewModel::requestDeactivation, enabled = !isSwitching, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
        Text(stringResource(R.string.encryption_detail_deactivate), color = MeeshyPalette.Error)
    }
    Text(stringResource(R.string.encryption_detail_deactivate_at_rest_footer), style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textMuted)
}

@Composable
private fun DeactivationDialog(onConfirm: () -> Unit, onCancel: () -> Unit) {
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(stringResource(R.string.encryption_detail_deactivate_at_rest_confirm_title)) },
        text = { Text(stringResource(R.string.encryption_detail_deactivate_at_rest_confirm_message)) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(stringResource(R.string.encryption_detail_deactivate), color = MeeshyPalette.Error) } },
        dismissButton = { TextButton(onClick = onCancel) { Text(stringResource(R.string.common_cancel)) } },
    )
}
