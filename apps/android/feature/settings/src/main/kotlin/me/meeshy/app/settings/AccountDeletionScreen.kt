package me.meeshy.app.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.MarkEmailRead
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Account-deletion screen (feature-parity §L) — port of iOS `DeleteAccountView`. A red
 * "danger" warning card enumerating what is lost, a monospace typed-phrase confirmation
 * field gated by [AccountDeletionConfirmation], and a destructive delete button. On
 * success the gateway opens a 90-day grace period and mails a confirmation link, so the
 * screen swaps to a "check your inbox" state (no logout). Pure glue over
 * [AccountDeletionViewModel]; all decision logic lives in the tested SSOTs.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountDeletionScreen(
    onBack: () -> Unit,
    viewModel: AccountDeletionViewModel = hiltViewModel(),
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
                        titleContentColor = MeeshyPalette.Error,
                        navigationIconContentColor = MeeshyPalette.Error,
                    ),
                    title = { Text(stringResource(R.string.delete_account_title)) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
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
                if (state.isEmailSent) {
                    EmailSentBlock(onDone = onBack)
                } else {
                    DeletionForm(state = state, viewModel = viewModel)
                }
                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }
}

@Composable
private fun DeletionForm(
    state: AccountDeletionUiState,
    viewModel: AccountDeletionViewModel,
) {
    WarningCard()

    Text(
        text = stringResource(
            R.string.delete_account_confirm_prompt,
            AccountDeletionConfirmationDisplay,
        ),
        style = MaterialTheme.typography.bodyMedium,
        color = MeeshyTheme.tokens.textPrimary,
    )

    OutlinedTextField(
        value = state.confirmationText,
        onValueChange = viewModel::onConfirmationTextChange,
        label = { Text(stringResource(R.string.delete_account_confirm_label)) },
        singleLine = true,
        isError = state.confirmationText.isNotEmpty() && !state.isConfirmed,
        trailingIcon = {
            if (state.isConfirmed) {
                Icon(
                    Icons.Filled.CheckCircle,
                    contentDescription = null,
                    tint = MeeshyPalette.Success,
                )
            }
        },
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.sm),
    )

    state.error?.let { error ->
        Text(
            text = stringResource(error.messageRes()),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyPalette.Error,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }

    Button(
        onClick = viewModel::submit,
        enabled = state.canSubmit,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.sm),
        colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Error),
    ) {
        if (state.isDeleting) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                color = MeeshyPalette.White,
                strokeWidth = 2.dp,
            )
            Spacer(Modifier.size(MeeshySpacing.sm))
        } else {
            Icon(Icons.Filled.DeleteForever, contentDescription = null)
            Spacer(Modifier.size(MeeshySpacing.sm))
        }
        Text(stringResource(R.string.delete_account_button))
    }
}

@Composable
private fun WarningCard() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                MeeshyPalette.Error.copy(alpha = 0.08f),
                RoundedCornerShape(MeeshySpacing.md),
            )
            .border(
                1.dp,
                MeeshyPalette.Error.copy(alpha = 0.3f),
                RoundedCornerShape(MeeshySpacing.md),
            )
            .padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Icon(Icons.Filled.Warning, contentDescription = null, tint = MeeshyPalette.Error)
            Text(
                text = stringResource(R.string.delete_account_warning_title),
                style = MaterialTheme.typography.titleMedium,
                color = MeeshyPalette.Error,
            )
        }
        Text(
            text = stringResource(R.string.delete_account_warning_intro),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
        )
        WarningBullet(stringResource(R.string.delete_account_warning_conversations))
        WarningBullet(stringResource(R.string.delete_account_warning_messages))
        WarningBullet(stringResource(R.string.delete_account_warning_media))
        WarningBullet(stringResource(R.string.delete_account_warning_contacts))
        WarningBullet(stringResource(R.string.delete_account_warning_preferences))
    }
}

@Composable
private fun WarningBullet(text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(
            Icons.Filled.Cancel,
            contentDescription = null,
            tint = MeeshyPalette.Error.copy(alpha = 0.7f),
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

@Composable
private fun EmailSentBlock(onDone: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(
            Icons.Filled.MarkEmailRead,
            contentDescription = null,
            tint = MeeshyPalette.Indigo500,
            modifier = Modifier
                .padding(top = MeeshySpacing.xl)
                .size(64.dp),
        )
        Text(
            text = stringResource(R.string.delete_account_email_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
        )
        Text(
            text = stringResource(R.string.delete_account_email_body),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
        Button(
            onClick = onDone,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = MeeshySpacing.md),
            colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
        ) {
            Text(stringResource(R.string.delete_account_email_ok))
        }
    }
}

/**
 * The literal shown to the user inside the prompt. Kept as a display constant (not the raw
 * SSOT reference) so the monospace formatting is applied by the caller; the value is the
 * same server literal [me.meeshy.sdk.model.AccountDeletionConfirmation.REQUIRED_PHRASE].
 */
private val AccountDeletionConfirmationDisplay: String =
    me.meeshy.sdk.model.AccountDeletionConfirmation.REQUIRED_PHRASE

private fun AccountDeletionError.messageRes(): Int = when (this) {
    AccountDeletionError.ALREADY_PENDING -> R.string.delete_account_error_pending
    AccountDeletionError.NETWORK -> R.string.delete_account_error_network
    AccountDeletionError.GENERIC -> R.string.delete_account_error_generic
}
