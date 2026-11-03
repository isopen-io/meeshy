package me.meeshy.app.settings

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.Surface
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.ChangePasswordValidation
import me.meeshy.ui.component.auth.AuthContentType
import me.meeshy.ui.component.auth.AuthTextField
import me.meeshy.ui.component.auth.PasswordStrengthIndicator
import me.meeshy.ui.component.chrome.CollapsibleHeaderPage
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.formColumnWidth

/**
 * Change-password screen (feature-parity §L) — port of iOS `ChangePasswordView`.
 * Current + new + confirm fields with per-field visibility toggles, a live 5-bar
 * strength meter, per-rule validation hints, and a submit gated on
 * [ChangePasswordValidation.canSubmit]. Pure glue over [ChangePasswordViewModel];
 * all decision logic lives in the tested SSOTs.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChangePasswordScreen(
    onBack: () -> Unit,
    viewModel: ChangePasswordViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    val haptics = rememberMeeshyHaptics()
    val focusManager = LocalFocusManager.current

    // The VM closes the screen 1.5 s after the success overlay appears.
    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                ChangePasswordEffect.Close -> onBack()
            }
        }
    }
    LaunchedEffect(state.isSuccess) { if (state.isSuccess) haptics.success() }
    LaunchedEffect(state.error) { if (state.error != null) haptics.error() }

    val submit = {
        if (state.canSubmit) {
            focusManager.clearFocus()
            haptics.medium()
            viewModel.submit()
        }
    }

    MeeshyBackground {
      Box {
        CollapsibleHeaderPage(
            title = stringResource(R.string.change_password_title),
            onBack = onBack,
            titleColor = MeeshyTheme.tokens.textPrimary,
            backArrowColor = MeeshyPalette.Indigo500,
            backgroundColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .formColumnWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                if (state.asksCurrentPassword) {
                    SectionHeader(stringResource(R.string.change_password_section_current), MeeshyIcons.Lock)
                    AuthTextField(
                        value = state.currentPassword,
                        onValueChange = viewModel::onCurrentPasswordChange,
                        title = stringResource(R.string.change_password_current_label),
                        icon = MeeshyIcons.Lock,
                        isSecure = true,
                        contentType = AuthContentType.Password,
                        enabled = !state.isSaving,
                    )
                }

                SectionHeader(stringResource(R.string.change_password_section_new), MeeshyIcons.Lock)
                AuthTextField(
                    value = state.newPassword,
                    onValueChange = viewModel::onNewPasswordChange,
                    title = stringResource(R.string.change_password_new_label),
                    icon = MeeshyIcons.Lock,
                    isSecure = true,
                    contentType = AuthContentType.NewPassword,
                    enabled = !state.isSaving,
                )

                if (state.newPassword.isNotEmpty()) {
                    PasswordStrengthIndicator(password = state.newPassword)
                }

                AuthTextField(
                    value = state.confirmPassword,
                    onValueChange = viewModel::onConfirmPasswordChange,
                    title = stringResource(R.string.change_password_confirm_label),
                    icon = MeeshyIcons.Lock,
                    isSecure = true,
                    contentType = AuthContentType.NewPassword,
                    imeAction = ImeAction.Done,
                    onImeAction = { submit() },
                    enabled = !state.isSaving,
                )

                ValidationHints(state = state)

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
                    onClick = { submit() },
                    enabled = state.canSubmit,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
                ) {
                    if (state.isSaving) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            color = MeeshyPalette.White,
                            strokeWidth = 2.dp,
                        )
                        Spacer(Modifier.size(MeeshySpacing.sm))
                    }
                    Text(
                        stringResource(
                            if (state.asksCurrentPassword) R.string.change_password_submit else R.string.change_password_set_submit,
                        ),
                    )
                }

                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
        SuccessOverlay(visible = state.isSuccess, isChange = state.asksCurrentPassword, modifier = Modifier.align(Alignment.Center))
      }
    }
}

@Composable
private fun SectionHeader(title: String, icon: ImageVector) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        modifier = Modifier.padding(start = MeeshySpacing.xs).semantics(mergeDescendants = true) { heading() },
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(14.dp))
        Text(
            text = title.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyPalette.Indigo500,
        )
    }
}

/** Confirmation transitoire : bouclier coché, scale + fondu en spring 0,4 / 0,8 (iOS `successOverlay`). */
@Composable
private fun SuccessOverlay(visible: Boolean, isChange: Boolean, modifier: Modifier = Modifier) {
    val spec = spring<Float>(dampingRatio = 0.8f, stiffness = MeeshyMotion.stiffnessForResponse(0.4f))
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = scaleIn(animationSpec = spec) + fadeIn(animationSpec = spec),
        exit = scaleOut(animationSpec = spec) + fadeOut(animationSpec = spec),
    ) {
        Surface(
            shape = androidx.compose.foundation.shape.RoundedCornerShape(MeeshyRadius.xl),
            color = MeeshyTheme.tokens.backgroundPrimary.copy(alpha = 0.92f),
            border = BorderStroke(1.dp, MeeshyPalette.Success.copy(alpha = 0.3f)),
        ) {
            Column(
                modifier = Modifier.padding(MeeshySpacing.xxxl).semantics(mergeDescendants = true) {},
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                Icon(
                    imageVector = MeeshyIcons.VerifiedUser,
                    contentDescription = null,
                    tint = MeeshyPalette.Success,
                    modifier = Modifier.size(56.dp),
                )
                Text(
                    text = stringResource(if (isChange) R.string.change_password_success else R.string.change_password_set_success),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                )
            }
        }
    }
}

@Composable
private fun ValidationHints(state: ChangePasswordUiState) {
    val validation = state.validation
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        HintRow(
            text = stringResource(R.string.change_password_hint_length),
            met = validation.isNewLongEnough,
        )
        HintRow(
            text = stringResource(R.string.change_password_hint_match),
            met = validation.passwordsMatch,
        )
        // Only surface the "must differ" hint once a new password is actually being typed.
        if (state.asksCurrentPassword && state.newPassword.isNotEmpty()) {
            HintRow(
                text = stringResource(R.string.change_password_hint_different),
                met = validation.isNewDifferent,
            )
        }
    }
}

@Composable
private fun HintRow(text: String, met: Boolean) {
    val color = if (met) MeeshyPalette.Success else MeeshyTheme.tokens.textMuted
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(
            imageVector = if (met) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(16.dp),
        )
        Text(text = text, style = MaterialTheme.typography.bodySmall, color = color)
    }
}

private fun ChangePasswordError.messageRes(): Int = when (this) {
    ChangePasswordError.INCORRECT_CURRENT -> R.string.change_password_error_current
    ChangePasswordError.WEAK -> R.string.change_password_error_weak
    ChangePasswordError.REJECTED -> R.string.change_password_error_rejected
    ChangePasswordError.NETWORK -> R.string.change_password_error_network
    ChangePasswordError.GENERIC -> R.string.change_password_error_generic
}
