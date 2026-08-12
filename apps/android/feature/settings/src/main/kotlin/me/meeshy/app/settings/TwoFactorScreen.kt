package me.meeshy.app.settings

import android.graphics.BitmapFactory
import android.util.Base64
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
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.TwoFactorQrDataUrl
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

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
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

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
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                when (state.stage) {
                    TwoFactorStage.STATUS -> StatusContent(state, viewModel)
                    TwoFactorStage.SETUP -> SetupContent(state, viewModel)
                    TwoFactorStage.BACKUP_CODES -> BackupCodesContent(state, viewModel)
                    TwoFactorStage.DISABLE -> DisableContent(state, viewModel)
                    TwoFactorStage.REGENERATE_CODES -> RegenerateContent(state, viewModel)
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
                        text = stringResource(R.string.twofactor_backup_codes_remaining, state.backupCodesCount),
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

@Composable
private fun SetupContent(state: TwoFactorUiState, viewModel: TwoFactorViewModel) {
    Text(
        text = stringResource(R.string.twofactor_setup_title),
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        color = MeeshyTheme.tokens.textPrimary,
    )
    Text(
        text = stringResource(R.string.twofactor_setup_instructions),
        style = MaterialTheme.typography.bodyMedium,
        color = MeeshyTheme.tokens.textSecondary,
    )

    val setupData = state.setupData
    if (setupData == null) {
        Box(Modifier.fillMaxWidth().padding(MeeshySpacing.xl), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = MeeshyPalette.Indigo500)
        }
        return
    }

    val qrBitmap = remember(setupData.qrCodeDataUrl) {
        TwoFactorQrDataUrl.base64Payload(setupData.qrCodeDataUrl)?.let { payload ->
            runCatching {
                val bytes = Base64.decode(payload, Base64.DEFAULT)
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
            }.getOrNull()
        }
    }
    qrBitmap?.let { bitmap ->
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            androidx.compose.foundation.Image(
                bitmap = bitmap,
                contentDescription = stringResource(R.string.twofactor_setup_title),
                modifier = Modifier
                    .size(220.dp)
                    .clip(RoundedCornerShape(MeeshyRadius.md)),
            )
        }
    }

    MeeshyGlassSurface(shape = RoundedCornerShape(MeeshyRadius.md), modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(MeeshySpacing.md)) {
            Text(
                text = stringResource(R.string.twofactor_setup_secret_label),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyTheme.tokens.textMuted,
            )
            Text(
                text = setupData.secret,
                style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                color = MeeshyTheme.tokens.textPrimary,
            )
        }
    }

    OutlinedTextField(
        value = state.codeInput,
        onValueChange = viewModel::onCodeChange,
        label = { Text(stringResource(R.string.twofactor_setup_code_label)) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        modifier = Modifier.fillMaxWidth(),
    )

    ErrorText(state.error)

    Button(
        onClick = viewModel::confirmSetup,
        enabled = state.canConfirmCode,
        modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
    ) {
        if (state.isSubmitting) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = MeeshyPalette.White, strokeWidth = 2.dp)
            Spacer(Modifier.size(MeeshySpacing.sm))
        }
        Text(stringResource(R.string.twofactor_setup_confirm))
    }
}

@Composable
private fun BackupCodesContent(state: TwoFactorUiState, viewModel: TwoFactorViewModel) {
    Text(
        text = stringResource(R.string.twofactor_backup_codes_title),
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        color = MeeshyTheme.tokens.textPrimary,
    )
    Text(
        text = stringResource(R.string.twofactor_backup_codes_warning),
        style = MaterialTheme.typography.bodyMedium,
        color = MeeshyPalette.Warning,
    )

    MeeshyGlassSurface(shape = RoundedCornerShape(MeeshyRadius.md), modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            state.backupCodes.forEach { code ->
                Text(
                    text = code,
                    style = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Monospace),
                    color = MeeshyTheme.tokens.textPrimary,
                )
            }
        }
    }

    Button(
        onClick = viewModel::acknowledgeBackupCodes,
        modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
    ) {
        Text(stringResource(R.string.twofactor_backup_codes_done))
    }
}

@Composable
private fun DisableContent(state: TwoFactorUiState, viewModel: TwoFactorViewModel) {
    Text(
        text = stringResource(R.string.twofactor_disable_title),
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        color = MeeshyTheme.tokens.textPrimary,
    )

    OutlinedTextField(
        value = state.disablePassword,
        onValueChange = viewModel::onDisablePasswordChange,
        label = { Text(stringResource(R.string.twofactor_disable_password_label)) },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = state.disableCode,
        onValueChange = viewModel::onDisableCodeChange,
        label = { Text(stringResource(R.string.twofactor_disable_code_label)) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        modifier = Modifier.fillMaxWidth(),
    )

    ErrorText(state.error)

    Button(
        onClick = viewModel::confirmDisable,
        enabled = state.canConfirmDisable,
        modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Error),
    ) {
        if (state.isSubmitting) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = MeeshyPalette.White, strokeWidth = 2.dp)
            Spacer(Modifier.size(MeeshySpacing.sm))
        }
        Text(stringResource(R.string.twofactor_disable_confirm))
    }
}

@Composable
private fun RegenerateContent(state: TwoFactorUiState, viewModel: TwoFactorViewModel) {
    Text(
        text = stringResource(R.string.twofactor_regenerate_title),
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        color = MeeshyTheme.tokens.textPrimary,
    )

    OutlinedTextField(
        value = state.codeInput,
        onValueChange = viewModel::onCodeChange,
        label = { Text(stringResource(R.string.twofactor_regenerate_code_label)) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        modifier = Modifier.fillMaxWidth(),
    )

    ErrorText(state.error)

    Button(
        onClick = viewModel::confirmRegenerateCodes,
        enabled = state.canConfirmCode,
        modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
    ) {
        if (state.isSubmitting) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = MeeshyPalette.White, strokeWidth = 2.dp)
            Spacer(Modifier.size(MeeshySpacing.sm))
        }
        Text(stringResource(R.string.twofactor_regenerate_confirm))
    }
}

@Composable
private fun ErrorText(error: TwoFactorErrorKind?) {
    val messageRes = error?.messageRes() ?: return
    Text(
        text = stringResource(messageRes),
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyPalette.Error,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

private fun TwoFactorErrorKind.messageRes(): Int = when (this) {
    TwoFactorErrorKind.STATUS -> R.string.twofactor_error_status
    TwoFactorErrorKind.SETUP -> R.string.twofactor_error_setup
    TwoFactorErrorKind.INVALID_CODE -> R.string.twofactor_error_invalid_code
    TwoFactorErrorKind.DISABLE -> R.string.twofactor_error_disable
    TwoFactorErrorKind.BACKUP_CODES -> R.string.twofactor_error_backup_codes
}
