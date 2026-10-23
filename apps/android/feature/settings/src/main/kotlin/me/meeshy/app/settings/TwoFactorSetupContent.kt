package me.meeshy.app.settings

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.TwoFactorQrDataUrl
import me.meeshy.sdk.model.TwoFactorSetupStep
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val QrSize = 200.dp

/** Activation 2FA, une étape à la fois — miroir de `TwoFactorSetupView` (iOS). */
@Composable
internal fun SetupContent(state: TwoFactorUiState, viewModel: TwoFactorViewModel, haptics: MeeshyHaptics) {
    when (state.flow.step) {
        TwoFactorSetupStep.LOADING -> LoadingStep()
        TwoFactorSetupStep.QR -> QrStep(state, viewModel, haptics)
        TwoFactorSetupStep.CODE -> CodeStep(state, viewModel, haptics)
        TwoFactorSetupStep.ERROR -> SetupErrorStep(viewModel, haptics)
        TwoFactorSetupStep.SUCCESS -> Unit
    }
}

@Composable
private fun LoadingStep() {
    Box(Modifier.fillMaxWidth().padding(top = MeeshySpacing.xxl), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = MeeshyPalette.Indigo500)
    }
}

@Composable
private fun QrStep(state: TwoFactorUiState, viewModel: TwoFactorViewModel, haptics: MeeshyHaptics) {
    val setupData = state.setupData ?: return LoadingStep()
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        Icon(
            Icons.Filled.QrCode2,
            contentDescription = null,
            tint = MeeshyPalette.Indigo500,
            modifier = Modifier.size(64.dp),
        )
        Text(
            text = stringResource(R.string.twofactor_scan_instruction),
            style = MaterialTheme.typography.titleSmall,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
        QrImage(setupData.qrCodeDataUrl)
        Text(
            text = stringResource(R.string.twofactor_manual_entry_label),
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textMuted,
        )
        SecretKeyRow(setupData.secret, state.copiedKey) {
            haptics.light()
            viewModel.copySecret()
        }
        Button(
            onClick = {
                haptics.medium()
                viewModel.onNext()
            },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
        ) {
            Text(stringResource(R.string.twofactor_next_button))
        }
    }
}

@Composable
private fun QrImage(dataUrl: String) {
    val bitmap = remember(dataUrl) {
        TwoFactorQrDataUrl.base64Payload(dataUrl)?.let { payload ->
            runCatching {
                val bytes = Base64.decode(payload, Base64.DEFAULT)
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
            }.getOrNull()
        }
    }
    if (bitmap == null) {
        Box(Modifier.size(QrSize), contentAlignment = Alignment.Center) {
            Icon(
                Icons.Filled.Warning,
                contentDescription = null,
                tint = MeeshyPalette.Warning,
                modifier = Modifier.size(40.dp),
            )
        }
        return
    }
    Image(
        bitmap = bitmap,
        contentDescription = stringResource(R.string.twofactor_scan_instruction),
        modifier = Modifier
            .size(QrSize)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyPalette.White),
    )
}

@Composable
private fun SecretKeyRow(secret: String, copied: Boolean, onCopy: () -> Unit) {
    val shape = RoundedCornerShape(MeeshyRadius.sm)
    val secretLabel = stringResource(R.string.twofactor_a11y_secret_key)
    val copiedLabel = stringResource(R.string.twofactor_a11y_copied)
    Row(
        modifier = Modifier
            .clip(shape)
            .background(MeeshyPalette.Indigo500.copy(alpha = 0.08f))
            .border(1.dp, MeeshyPalette.Indigo500.copy(alpha = 0.2f), shape)
            .padding(start = MeeshySpacing.md, top = MeeshySpacing.xs, bottom = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        SelectionContainer(
            modifier = Modifier.semantics { contentDescription = "$secretLabel, $secret" },
        ) {
            Text(
                text = secret,
                style = MaterialTheme.typography.titleSmall.copy(fontFamily = FontFamily.Monospace),
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
            )
        }
        IconButton(
            onClick = onCopy,
            modifier = Modifier.semantics {
                if (copied) stateDescription = copiedLabel
            },
        ) {
            Icon(
                imageVector = if (copied) Icons.Filled.Check else Icons.Filled.ContentCopy,
                contentDescription = stringResource(
                    if (copied) R.string.twofactor_a11y_copied else R.string.twofactor_a11y_copy_key,
                ),
                tint = if (copied) MeeshyPalette.Success else MeeshyPalette.Indigo500,
            )
        }
    }
}

@Composable
private fun CodeStep(state: TwoFactorUiState, viewModel: TwoFactorViewModel, haptics: MeeshyHaptics) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        Icon(
            Icons.Filled.Lock,
            contentDescription = null,
            tint = MeeshyPalette.Indigo500,
            modifier = Modifier.size(56.dp),
        )
        Text(
            text = stringResource(R.string.twofactor_enter_code_instruction),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
        OutlinedTextField(
            value = state.codeInput,
            onValueChange = viewModel::onCodeChange,
            placeholder = {
                Text(
                    stringResource(R.string.twofactor_code_placeholder),
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.headlineMedium.copy(fontFamily = FontFamily.Monospace),
                )
            },
            singleLine = true,
            textStyle = MaterialTheme.typography.headlineMedium.copy(
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            ),
            isError = state.flow.codeRejected,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            modifier = Modifier.fillMaxWidth(),
        )
        if (state.flow.codeRejected) {
            ErrorText(state.error)
        }
        Button(
            onClick = {
                haptics.medium()
                viewModel.confirmSetup()
            },
            enabled = state.canConfirmCode,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
        ) {
            if (state.isSubmitting) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), color = MeeshyPalette.White, strokeWidth = 2.dp)
                Spacer(Modifier.size(MeeshySpacing.sm))
            }
            Text(stringResource(R.string.twofactor_verify_button))
        }
        TextButton(onClick = {
            haptics.light()
            viewModel.onBackToQr()
        }) {
            Text(stringResource(R.string.twofactor_back_to_qr), color = MeeshyPalette.Indigo500)
        }
    }
}

@Composable
private fun SetupErrorStep(viewModel: TwoFactorViewModel, haptics: MeeshyHaptics) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        Icon(
            Icons.Filled.Warning,
            contentDescription = null,
            tint = MeeshyPalette.Error,
            modifier = Modifier.size(56.dp),
        )
        Text(
            text = stringResource(R.string.twofactor_error_setup),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
        TextButton(onClick = {
            haptics.light()
            viewModel.beginSetup()
        }) {
            Text(stringResource(R.string.twofactor_retry), color = MeeshyPalette.Indigo500)
        }
    }
}
