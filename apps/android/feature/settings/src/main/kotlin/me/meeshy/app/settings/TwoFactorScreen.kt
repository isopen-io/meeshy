package me.meeshy.app.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.util.SensitiveClipboard
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.formColumnWidth

/**
 * Two-factor authentication settings screen (feature-parity §L) — port of iOS
 * `TwoFactorSetupView`/`SecurityView`'s 2FA section. Status → setup (QR + TOTP
 * confirm) → backup codes → optional disable/regenerate, all driven by
 * [TwoFactorViewModel]'s [TwoFactorStage]. Pure glue: every decision (code format,
 * submit gating, stage transitions) lives in the tested view model.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TwoFactorScreen(
    onBack: () -> Unit,
    viewModel: TwoFactorViewModel = hiltViewModel(),
    startStep: String? = null,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    val context = LocalContext.current
    val haptics = rememberMeeshyHaptics()
    val clipboard = remember(context) { SensitiveClipboard(context) }

    LaunchedEffect(startStep) {
        viewModel.openAtStep(startStep)
    }

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is TwoFactorEffect.CopySecret -> clipboard.write("meeshy-2fa-secret", effect.text)
                is TwoFactorEffect.CopyBackupCodes -> clipboard.write("meeshy-2fa-backup-codes", effect.text)
                TwoFactorEffect.HapticSuccess -> haptics.success()
                TwoFactorEffect.HapticError -> haptics.error()
            }
        }
    }

    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                        navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    title = { Text(stringResource(R.string.twofactor_title)) },
                    navigationIcon = {
                        IconButton(
                            onClick = { if (state.stage == TwoFactorStage.STATUS) onBack() else viewModel.cancel() },
                        ) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.settings_back),
                            )
                        }
                    },
                )
            },
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .formColumnWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                when (state.stage) {
                    TwoFactorStage.STATUS -> StatusContent(state, viewModel)
                    TwoFactorStage.SETUP -> SetupContent(state, viewModel, haptics)
                    TwoFactorStage.BACKUP_CODES -> BackupCodesContent(state, viewModel, haptics)
                    TwoFactorStage.DISABLE -> DisableContent(state, viewModel, haptics)
                    TwoFactorStage.REGENERATE_CODES -> RegenerateContent(state, viewModel, haptics)
                }
                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }
}

@Composable
private fun StatusContent(state: TwoFactorUiState, viewModel: TwoFactorViewModel) {
    if (state.isLoading) {
        Box(Modifier.fillMaxWidth().padding(MeeshySpacing.xl), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = MeeshyPalette.Indigo500)
        }
        return
    }

    MeeshyGlassSurface(shape = RoundedCornerShape(MeeshyRadius.lg), modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(MeeshySpacing.lg), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Filled.Shield,
                contentDescription = null,
                tint = if (state.isEnabled) MeeshyPalette.Success else MeeshyTheme.tokens.textMuted,
                modifier = Modifier.size(32.dp),
            )
            Spacer(Modifier.size(MeeshySpacing.md))
            Column {
                Text(
                    text = stringResource(
                        if (state.isEnabled) R.string.twofactor_status_enabled else R.string.twofactor_status_disabled,
                    ),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MeeshyTheme.tokens.textPrimary,
                )
                if (state.isEnabled) {
                    Text(
                        text = pluralStringResource(
                            R.plurals.twofactor_backup_codes_remaining,
                            state.backupCodesCount,
                            state.backupCodesCount,
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textMuted,
                    )
                }
            }
        }
    }

    ErrorText(state.error)

    if (state.isEnabled) {
        OutlinedButton(onClick = viewModel::beginRegenerateCodes, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.twofactor_regenerate_button))
        }
        TextButton(onClick = viewModel::beginDisable, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.twofactor_disable_button), color = MeeshyPalette.Error)
        }
    } else {
        Button(
            onClick = viewModel::beginSetup,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
        ) {
            Text(stringResource(R.string.twofactor_enable_button))
        }
    }
}
