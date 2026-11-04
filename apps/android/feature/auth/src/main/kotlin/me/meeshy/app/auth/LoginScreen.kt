package me.meeshy.app.auth

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import me.meeshy.app.onboarding.rememberOnboardingReduceMotion
import me.meeshy.sdk.model.auth.SavedAccount
import me.meeshy.ui.component.auth.AmbientHalos
import me.meeshy.ui.component.auth.BrandSignature
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.ThemePalette
import me.meeshy.ui.theme.formColumnWidth

/** iOS `LoginView` : les champs entrent 0,2 s après l'écran, en ressort (réponse 0,7 s, amortissement 0,8). */
private const val FIELDS_DELAY_MS = 200L
private const val FIELDS_SPRING_STIFFNESS = 80f
private const val FIELDS_SPRING_DAMPING = 0.8f
private val FIELDS_RISE = 32.dp

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onAuthenticated: () -> Unit,
    onSignUp: () -> Unit = {},
    onForgotPassword: () -> Unit = {},
    onMagicLink: () -> Unit = {},
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val reduceMotion = rememberOnboardingReduceMotion()
    val isDark = MeeshyTheme.isDark

    LaunchedEffect(state.isAuthenticated) {
        if (state.isAuthenticated) onAuthenticated()
    }

    // Ce que l'inscription ou « Changer de compte » a remis à cet écran avant qu'il n'existe (iOS onAppear).
    LaunchedEffect(Unit) { viewModel.adoptPendingHandoffs() }

    LaunchedEffect(state.restartToApplyEnvironment) {
        if (state.restartToApplyEnvironment) restartToApplyServer(context)
    }

    var showFields by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(FIELDS_DELAY_MS)
        showFields = true
    }
    val appearance by animateFloatAsState(
        targetValue = if (showFields) 1f else 0f,
        animationSpec = if (reduceMotion) {
            tween(durationMillis = 150)
        } else {
            spring(dampingRatio = FIELDS_SPRING_DAMPING, stiffness = FIELDS_SPRING_STIFFNESS)
        },
        label = "loginFieldsAppearance",
    )

    // Le fond est PLEIN ECRAN (degrade du theme + halos) ; seul le CONTENU respecte les barres systeme.
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ThemePalette(isDark).backgroundGradient)
            .pointerInput(Unit) { detectTapGestures { focusManager.clearFocus() } },
    ) {
        AmbientHalos(reduceMotion = reduceMotion)
        Column(
            modifier = Modifier
                .fillMaxSize()
                // Cet ecran n'a pas de Scaffold : le Scaffold racine ne reserve plus les barres systeme
                // (MeeshyApp.kt, contentWindowInsets a zero), il pose lui-meme son inset.
                .systemBarsPadding()
                .imePadding()
                .formColumnWidth()
                .padding(horizontal = MeeshySpacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            LoginBrandHeader(reduceMotion = reduceMotion)

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .graphicsLayer {
                        alpha = appearance.coerceIn(0f, 1f)
                        translationY = if (reduceMotion) 0f else (1f - appearance) * FIELDS_RISE.toPx()
                    },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                LoginBody(
                    state = state,
                    viewModel = viewModel,
                    onForgotPassword = {
                        viewModel.holdRecoveryEmail()
                        onForgotPassword()
                    },
                    onMagicLink = {
                        viewModel.holdRecoveryEmail()
                        onMagicLink()
                    },
                )

                LoginSignupLink(
                    enabled = !state.isSubmitting,
                    onSignUp = onSignUp,
                    modifier = Modifier.padding(top = MeeshySpacing.md),
                )

                // Parity iOS LoginView.environmentSelector — developer/QA-only backend picker.
                if (state.showEnvironmentSelector) {
                    EnvironmentSelector(
                        state = state,
                        onSelect = viewModel::selectEnvironment,
                        onCustomHostChange = viewModel::onCustomHostChange,
                        onApplyCustomHost = viewModel::applyCustomHost,
                        modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md),
                    )
                }

                BrandSignature(modifier = Modifier.padding(top = MeeshySpacing.md))
            }
        }
    }
}

/**
 * Parity iOS LoginView: showPicker gates the remembered-account picker (list, or the selected
 * account's password prompt) vs. the plain username/password form — see AuthUiState.showPicker.
 */
@Composable
private fun LoginBody(
    state: AuthUiState,
    viewModel: AuthViewModel,
    onForgotPassword: () -> Unit,
    onMagicLink: () -> Unit,
) {
    val verificationPending = state.pendingVerification
    val selected: SavedAccount? = state.selectedAccount
    when {
        state.twoFactorToken != null -> LoginTwoFactorStep(
            state = state,
            onCodeChange = viewModel::onTwoFactorCodeChange,
            onSubmit = viewModel::submitTwoFactor,
            onCancel = viewModel::cancelTwoFactor,
            modifier = Modifier.fillMaxWidth(),
        )
        verificationPending != null -> {
            val verification: EmailVerificationViewModel = hiltViewModel(key = verificationPending.email)
            LaunchedEffect(verificationPending) {
                verification.begin(
                    email = verificationPending.email,
                    password = state.password,
                    accountCreated = verificationPending.accountCreated,
                    pendingSessionToken = verificationPending.pendingSessionToken,
                )
            }
            EmailVerificationSheet(
                viewModel = verification,
                onVerified = viewModel::completeEmailProof,
                onClose = viewModel::cancelVerification,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        state.showPicker && selected != null -> SelectedAccountForm(
            account = selected,
            state = state,
            viewModel = viewModel,
            modifier = Modifier.fillMaxWidth(),
        )
        state.showPicker -> SavedAccountsPicker(
            accounts = state.savedAccounts,
            errorText = state.errorRes?.let { stringResource(it) } ?: state.errorMessage,
            onAccountTap = viewModel::selectAccount,
            onAccountRemove = viewModel::removeAccount,
            onOtherAccount = viewModel::useAnotherAccount,
            modifier = Modifier.fillMaxWidth(),
        )
        else -> NormalLoginForm(
            state = state,
            viewModel = viewModel,
            showBackToPicker = state.showNormalLogin && state.savedAccounts.isNotEmpty(),
            onForgotPassword = onForgotPassword,
            onMagicLink = onMagicLink,
        )
    }
}
