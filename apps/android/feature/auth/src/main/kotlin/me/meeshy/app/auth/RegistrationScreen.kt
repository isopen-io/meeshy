package me.meeshy.app.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.RegistrationLeadingAction
import me.meeshy.sdk.model.auth.RegistrationNavModel
import me.meeshy.sdk.model.auth.RegistrationPrimaryAction
import me.meeshy.sdk.model.auth.RegistrationPrimaryLabel
import me.meeshy.sdk.model.auth.RegistrationStep
import me.meeshy.sdk.model.auth.RegistrationStepContent
import me.meeshy.sdk.model.auth.StepFill
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The 8-step gamified registration wizard's pager/progress-bar/nav-chrome
 * container — parity target: iOS `OnboardingFlowView`
 * (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingFlowView.swift`).
 *
 * Every decision (proceed gate, step transitions, progress-bar fill/jump, nav
 * chrome) already lives in the pure `:core:model` cores the injected
 * [RegistrationViewModel] wires — this Composable is a dumb renderer over
 * [me.meeshy.sdk.model.auth.RegistrationUiState] (exempt from the JVM coverage
 * gate per `TDD-COVERAGE.md`; the ONE new decision this slice adds —
 * [RegistrationStepContent.isImplemented] — is covered by
 * `RegistrationStepContentTest`).
 *
 * Only [RegistrationStep.PSEUDO] has real field UI today (slice
 * `auth-onboarding-shell`); every other step renders an inert "coming soon"
 * placeholder — never a dead end, since [RegistrationLeadingAction.BACK] is
 * always reachable off the first step. Each subsequent step gets its own
 * slice per the decomposition note in `feature-parity.md` §A.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegistrationScreen(
    onClose: () -> Unit,
    onRegistered: () -> Unit,
    viewModel: RegistrationViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(state.isRegistered) {
        if (state.isRegistered) onRegistered()
    }

    val nav = state.nav

    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                RegistrationTopBar(
                    nav = nav,
                    onLeadingClick = {
                        if (nav.leading == RegistrationLeadingAction.CLOSE) onClose() else viewModel.previous()
                    },
                )
            },
            bottomBar = {
                RegistrationBottomBar(
                    nav = nav,
                    isSubmitting = state.isSubmitting,
                    onPrimaryClick = {
                        if (nav.primaryAction == RegistrationPrimaryAction.REGISTER) {
                            viewModel.register()
                        } else {
                            viewModel.next()
                        }
                    },
                    onSkipClick = viewModel::skip,
                )
            },
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .imePadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            ) {
                RegistrationProgressRow(fill = state::fill, onStepTap = viewModel::jumpTo)

                state.errorMessage?.let { message ->
                    Text(
                        text = message,
                        color = MeeshyTheme.tokens.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = MeeshySpacing.sm),
                    )
                }

                if (RegistrationStepContent.isImplemented(state.currentStep)) {
                    when (state.currentStep) {
                        RegistrationStep.PSEUDO -> PseudoStepBody(state = state, viewModel = viewModel)
                        // Each future per-step slice adds its own arm here, in lockstep
                        // with RegistrationStepContent's implemented set.
                        else -> Unit
                    }
                } else {
                    StepPlaceholderBody()
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RegistrationTopBar(nav: RegistrationNavModel, onLeadingClick: () -> Unit) {
    TopAppBar(
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = Color.Transparent,
            scrolledContainerColor = Color.Transparent,
            titleContentColor = MeeshyTheme.tokens.textPrimary,
            navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
        ),
        title = {
            Text(
                text = nav.positionLabel,
                style = MaterialTheme.typography.labelLarge,
                color = MeeshyTheme.tokens.textSecondary,
            )
        },
        navigationIcon = {
            IconButton(onClick = onLeadingClick) {
                when (nav.leading) {
                    RegistrationLeadingAction.CLOSE -> Icon(
                        Icons.Filled.Close,
                        contentDescription = stringResource(R.string.registration_close),
                    )
                    RegistrationLeadingAction.BACK -> Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.registration_back),
                    )
                }
            }
        },
    )
}

@Composable
private fun RegistrationProgressRow(
    fill: (RegistrationStep) -> StepFill,
    onStepTap: (RegistrationStep) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        RegistrationStep.ordered.forEach { step ->
            val role = fill(step)
            val color = when (role) {
                StepFill.COMPLETED, StepFill.CURRENT -> MeeshyPalette.Indigo500
                StepFill.UPCOMING -> MeeshyPalette.Neutral400.copy(alpha = 0.4f)
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(if (role == StepFill.CURRENT) 6.dp else 4.dp)
                    .clip(RoundedCornerShape(MeeshyRadius.pill))
                    .background(color)
                    .clickable(enabled = role != StepFill.UPCOMING) { onStepTap(step) },
            )
        }
    }
}

@Composable
private fun RegistrationBottomBar(
    nav: RegistrationNavModel,
    isSubmitting: Boolean,
    onPrimaryClick: () -> Unit,
    onSkipClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
    ) {
        MeeshyPrimaryButton(
            text = stringResource(
                when (nav.primaryLabel) {
                    RegistrationPrimaryLabel.NEXT -> R.string.registration_next
                    RegistrationPrimaryLabel.CONTINUE -> R.string.registration_continue
                    RegistrationPrimaryLabel.CREATE_ACCOUNT -> R.string.registration_create_account
                },
            ),
            onClick = onPrimaryClick,
            enabled = nav.primaryEnabled,
            loading = isSubmitting,
            modifier = Modifier.fillMaxWidth(),
        )
        if (nav.showSkip) {
            TextButton(
                onClick = onSkipClick,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            ) {
                Text(
                    text = stringResource(R.string.registration_skip_step),
                    color = MeeshyTheme.tokens.textSecondary,
                )
            }
        }
    }
}

@Composable
private fun PseudoStepBody(state: RegistrationUiState, viewModel: RegistrationViewModel) {
    Column(
        modifier = Modifier.padding(top = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            text = stringResource(R.string.registration_pseudo_header),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(
            text = stringResource(R.string.registration_pseudo_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        OutlinedTextField(
            value = state.fields.username,
            onValueChange = viewModel::onUsernameChange,
            label = { Text(stringResource(R.string.registration_username_label)) },
            singleLine = true,
            enabled = !state.isSubmitting,
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md),
        )
        state.fields.usernameAvailable?.let { available ->
            val (text, color) = if (available) {
                stringResource(R.string.registration_username_available) to MeeshyPalette.Success
            } else {
                stringResource(R.string.registration_username_taken) to MeeshyPalette.Error
            }
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                color = color,
                modifier = Modifier.padding(top = MeeshySpacing.xs),
            )
        }
    }
}

@Composable
private fun StepPlaceholderBody() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xxxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            text = stringResource(R.string.registration_step_placeholder_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(
            text = stringResource(R.string.registration_step_placeholder_body),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
    }
}
