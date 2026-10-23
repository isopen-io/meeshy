package me.meeshy.app.settings

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.sdk.model.AccountDeletionPhase
import me.meeshy.sdk.model.WireDate
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

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
    val haptics = rememberMeeshyHaptics()
    val reduceMotion = LocalReduceMotion.current

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                AccountDeletionEffect.HAPTIC_HEAVY -> haptics.heavy()
                AccountDeletionEffect.HAPTIC_SUCCESS -> haptics.success()
                AccountDeletionEffect.HAPTIC_ERROR -> haptics.error()
            }
        }
    }

    if (state.showFinalConfirmation) {
        FinalConfirmationDialog(
            onConfirm = viewModel::confirmDeletion,
            onDismiss = viewModel::dismissFinalConfirmation,
        )
    }

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
                AnimatedContent(
                    targetState = state.isEmailSent,
                    transitionSpec = {
                        if (reduceMotion) {
                            fadeIn() togetherWith fadeOut()
                        } else {
                            val motion = spring<Float>(dampingRatio = 0.8f, stiffness = EMAIL_SWITCH_STIFFNESS)
                            (fadeIn(motion) + scaleIn(motion, initialScale = 0.95f)) togetherWith fadeOut(motion)
                        }
                    },
                    label = "deletion-email-switch",
                ) { emailSent ->
                    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
                        if (emailSent) {
                            EmailSentBlock(onDone = onBack)
                        } else {
                            DeletionStatusCard(state)
                            if (state.deletion.isOpenRequest()) return@Column
                            DeletionForm(state = state, viewModel = viewModel)
                        }
                    }
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

    val phraseState = stringResource(
        if (state.isConfirmed) R.string.account_delete_confirmation_value_matched
        else R.string.account_delete_confirmation_value_pending,
    )
    OutlinedTextField(
        value = state.confirmationText,
        onValueChange = viewModel::onConfirmationTextChange,
        label = { Text(stringResource(R.string.delete_account_confirm_label)) },
        singleLine = true,
        isError = state.confirmationText.isNotEmpty() && !state.isConfirmed,
        textStyle = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Monospace),
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
            .padding(top = MeeshySpacing.sm)
            .semantics { stateDescription = phraseState },
    )

    PasswordField(
        label = stringResource(R.string.delete_account_password_label),
        value = state.currentPassword,
        onValueChange = viewModel::onCurrentPasswordChange,
        isError = state.error == AccountDeletionError.INVALID_PASSWORD,
        modifier = Modifier.padding(top = MeeshySpacing.sm),
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

    val buttonState = stringResource(
        if (state.isConfirmed) R.string.account_delete_button_hint_ready
        else R.string.account_delete_button_hint_type_phrase,
    )
    Button(
        onClick = viewModel::requestDeletion,
        enabled = state.canSubmit,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.sm)
            .semantics { stateDescription = buttonState },
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

/** Local port of the `PasswordField` in `ChangePasswordScreen.kt` — that one is
 *  `private` to its file, so this screen carries its own (same visibility toggle,
 *  same visual transformation). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PasswordField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    isError: Boolean,
    modifier: Modifier = Modifier,
) {
    var visible by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        isError = isError,
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        trailingIcon = {
            IconButton(onClick = { visible = !visible }) {
                Icon(
                    imageVector = if (visible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                    contentDescription = stringResource(
                        if (visible) R.string.change_password_hide else R.string.change_password_show,
                    ),
                    tint = MeeshyTheme.tokens.textSecondary,
                )
            }
        },
        modifier = modifier.fillMaxWidth(),
    )
}

@Composable
private fun FinalConfirmationDialog(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.account_delete_final_title)) },
        text = { Text(stringResource(R.string.account_delete_final_message)) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(stringResource(R.string.common_delete), color = MeeshyPalette.Error)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_cancel)) }
        },
    )
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

/** Spring response 0,5 s (iOS `.spring(response: 0.5)`) ≈ stiffness (2π/0,5)². */
private const val EMAIL_SWITCH_STIFFNESS = 158f

/**
 * The literal shown to the user inside the prompt. Kept as a display constant (not the raw
 * SSOT reference) so the monospace formatting is applied by the caller; the value is the
 * same server literal [me.meeshy.sdk.model.AccountDeletionConfirmation.REQUIRED_PHRASE].
 */
private val AccountDeletionConfirmationDisplay: String =
    me.meeshy.sdk.model.AccountDeletionConfirmation.REQUIRED_PHRASE

private fun AccountDeletionError.messageRes(): Int = when (this) {
    AccountDeletionError.INVALID_PASSWORD -> R.string.delete_account_error_invalid_password
    AccountDeletionError.ALREADY_PENDING -> R.string.delete_account_error_pending
    AccountDeletionError.NO_EMAIL -> R.string.delete_account_error_no_email
    AccountDeletionError.NETWORK -> R.string.delete_account_error_network
    AccountDeletionError.GENERIC -> R.string.account_delete_error
}

private fun AccountDeletionPhase?.isOpenRequest(): Boolean =
    this is AccountDeletionPhase.PendingConfirmation || this is AccountDeletionPhase.GracePeriod

private fun formatWireDay(iso: String?): String? {
    val millis = WireDate.epochMillis(iso) ?: return null
    return DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withZone(ZoneId.systemDefault())
        .format(Instant.ofEpochMilli(millis))
}

/**
 * Where the deletion request stands (`GET me/account/deletion`). Cancelling goes through the
 * link in the e-mail, so no cancel button is offered; nothing is shown while the status is unread
 * or when there is no request.
 */
@Composable
private fun DeletionStatusCard(state: AccountDeletionUiState) {
    val phase = state.deletion
    if (!phase.isOpenRequest()) return
    val lines = when (phase) {
        is AccountDeletionPhase.GracePeriod -> {
            val until = formatWireDay(phase.cancelableUntil)
            listOf(
                if (until != null) stringResource(R.string.account_lifecycle_deletion_grace, until)
                else stringResource(R.string.account_lifecycle_deletion_grace_no_date),
            )
        }
        else -> listOfNotNull(
            stringResource(R.string.account_lifecycle_deletion_pending),
            formatWireDay(state.tokenExpiresAt)?.let { stringResource(R.string.account_lifecycle_deletion_pending_expires, it) },
        )
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MeeshyPalette.Warning.copy(alpha = 0.12f), RoundedCornerShape(MeeshySpacing.md))
            .padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        lines.forEach {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
        }
    }
}
