@file:OptIn(ExperimentalMaterial3Api::class)

package me.meeshy.app.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.auth.LanguageStepSelection
import me.meeshy.sdk.model.auth.SignupField
import me.meeshy.sdk.model.auth.SignupPrimaryAction
import me.meeshy.sdk.model.auth.SignupSubmitError
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.auth.AuthContentType
import me.meeshy.ui.component.auth.AuthTextField
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.formColumnWidth

internal const val SIGNUP_EMAIL_TAG: String = "signup.email"
internal const val SIGNUP_PRIMARY_TAG: String = "signup.primary"
internal const val SIGNUP_SIGN_IN_TAG: String = "signup.signIn"

private const val PHASE_RESPONSE = 0.42f
private const val PHASE_DAMPING = 0.8f
private const val PHASE_SCALE_FROM = 0.97f
private const val REDUCED_FADE_MS = 200
private const val INACTIVE_ALPHA = 0.6f
private val PRIMARY_MIN_HEIGHT = 52.dp
private val PHASE_GAP = MeeshySpacing.xl

/**
 * L'inscription en phases vivantes (iOS `SignupView`) : UN écran qui se déplie à mesure que la
 * saisie avance — le téléphone d'abord, l'adresse dès qu'un numéro plausible existe, puis la
 * carte « Votre compte » (nom et @pseudo pré-dérivés et modifiables, mot de passe facultatif).
 * Une phase parue ne disparaît jamais.
 *
 * L'écran ne décide de rien : phases, refus, état du bouton viennent de [SignupUiState], au-dessus
 * des cœurs purs `SignupPhases` / `SignupForm`. Aucune attente ne précède la saisie ni ne la suit.
 */
@Composable
fun SignupScreen(
    onClose: () -> Unit,
    onRegistered: () -> Unit,
    onOpenTerms: () -> Unit = {},
    onOpenPrivacy: () -> Unit = {},
    onOpenSignInLink: () -> Unit = {},
    onOpenForgotPassword: () -> Unit = {},
    viewModel: SignupViewModel = hiltViewModel(),
    codeEntry: @Composable () -> EmailVerificationViewModel = { hiltViewModel(key = SIGNUP_CODE_ENTRY_KEY) },
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val scroll = rememberScrollState()
    val actions = remember(viewModel) {
        SignupCardActions(
            onDisplayNameChange = viewModel::onDisplayNameChange,
            onUsernameChange = viewModel::onUsernameChange,
            onSuggestionPicked = viewModel::onUsernameSuggestionPicked,
            onPasswordChange = viewModel::onPasswordChange,
            onSubmit = viewModel::onPrimary,
            onValidateNow = viewModel::validateNow,
            onSignIn = { viewModel.onSwitchToLogin(); onClose() },
        )
    }

    val takenActions = remember(viewModel) {
        SignupEmailTakenActions(
            onItsMe = viewModel::requestSignInLink,
            onNotMe = viewModel::claimEmail,
            onForgotPassword = viewModel::onForgotPassword,
        )
    }
    val latestOpenSignInLink by rememberUpdatedState(onOpenSignInLink)
    val latestOpenForgotPassword by rememberUpdatedState(onOpenForgotPassword)
    LaunchedEffect(viewModel) {
        viewModel.effect.collect { effect ->
            when (effect) {
                SignupEffect.OpenSignInLink -> latestOpenSignInLink()
                SignupEffect.OpenForgotPassword -> latestOpenForgotPassword()
            }
        }
    }
    LaunchedEffect(state.isRegistered) {
        if (state.isRegistered) onRegistered()
    }
    // Le clavier se ferme au défilement : le clavier qui suit le doigt n'est pas celui d'un champ.
    LaunchedEffect(scroll.isScrollInProgress) {
        if (scroll.isScrollInProgress) {
            focusManager.clearFocus()
            keyboard?.hide()
        }
    }

    MeeshyBackground {
        Column(modifier = Modifier.fillMaxSize()) {
            SignupCloseBar(onClose = onClose)
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    // Un toucher HORS des champs leur retire la main — et le numéro quitté dit son refus.
                    .pointerInput(Unit) { detectTapGestures { focusManager.clearFocus() } }
                    .imePadding()
                    .verticalScroll(scroll)
                    .formColumnWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            ) {
                SignupHeader()
                SignupPhoneSection(state = state, viewModel = viewModel)
                PhaseReveal(visible = state.progress.emailShown) {
                    EmailPhase(state = state, viewModel = viewModel, takenActions = takenActions, modifier = Modifier.padding(top = PHASE_GAP))
                }
                PhaseReveal(visible = state.progress.cardShown) {
                    Column(
                        modifier = Modifier.padding(top = PHASE_GAP),
                        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
                    ) {
                        SignupIdentityCard(
                            state = state,
                            actions = actions,
                            codeStep = { step -> SignupCodeHost(step, viewModel, codeEntry()) },
                        )
                        if (state.card is SignupCard.Editing) LanguagePill(state = state, viewModel = viewModel)
                    }
                }
                if (state.globalError != null) {
                    Box(Modifier.padding(top = PHASE_GAP)) { GlobalErrorBanner(error = state.globalError) }
                }
                SignupPrimaryButton(state = state, onClick = viewModel::onPrimary, modifier = Modifier.padding(top = PHASE_GAP))
                LegalNotice(onOpenTerms = onOpenTerms, onOpenPrivacy = onOpenPrivacy)
                SignInPrompt(enabled = !state.isSubmitting, onSignIn = { viewModel.onSwitchToLogin(); onClose() })
            }
        }
    }
}

/** La croix vit dans SA barre : empilée au-dessus du défilement, jamais en surimpression du formulaire. */
@Composable
private fun SignupCloseBar(onClose: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onClose, modifier = Modifier.size(48.dp)) {
            Icon(
                imageVector = MeeshyIcons.Close,
                contentDescription = stringResource(R.string.signup_close),
                tint = MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

@Composable
private fun SignupHeader() {
    Column(modifier = Modifier.padding(bottom = PHASE_GAP), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(
            text = stringResource(R.string.signup_title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = stringResource(R.string.signup_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

/**
 * Une phase qui PARAÎT : ressort 0,42 / 0,8 — opacité, déplacement et échelle 0,97 — ou fondu
 * seul sous « Réduire les animations ». Une phase n'en sort jamais : [visible] ne redevient pas faux.
 */
@Composable
private fun PhaseReveal(visible: Boolean, content: @Composable () -> Unit) {
    val reduce = LocalReduceMotion.current
    val stiffness = MeeshyMotion.stiffnessForResponse(PHASE_RESPONSE)
    val enter: EnterTransition = if (reduce) {
        fadeIn(tween(REDUCED_FADE_MS))
    } else {
        fadeIn(spring(PHASE_DAMPING, stiffness)) +
            slideInVertically(spring(PHASE_DAMPING, stiffness, IntOffset.VisibilityThreshold)) { it / 4 } +
            scaleIn(spring(PHASE_DAMPING, stiffness), initialScale = PHASE_SCALE_FROM) +
            expandVertically(spring(PHASE_DAMPING, stiffness, IntSize.VisibilityThreshold))
    }
    AnimatedVisibility(visible = visible, enter = enter, exit = ExitTransition.None) {
        content()
    }
}

@Composable
private fun SignupPhoneSection(state: SignupUiState, viewModel: SignupViewModel) {
    var showCountryPicker by remember { mutableStateOf(false) }
    val countries = rememberCountryCatalog()
    val country = remember(state.form.dialCountryIso, countries) {
        selectedCountry(state.form.dialCountryIso, countries)
    }
    SignupPhoneRow(
        country = country,
        phoneDigits = state.form.phoneDigits,
        onPhoneChange = viewModel::onPhoneEntryChange,
        onCountryClick = { showCountryPicker = true },
        onFieldLeft = viewModel::onPhoneFieldLeft,
        errorText = phoneErrorText(state),
        enabled = !state.isLocked,
    )
    if (showCountryPicker) {
        CountryPickerSheet(
            countries = countries,
            onSelect = { picked ->
                viewModel.onDialCountryChange(picked.iso)
                showCountryPicker = false
            },
            onDismiss = { showCountryPicker = false },
        )
    }
}

@Composable
private fun EmailPhase(
    state: SignupUiState,
    viewModel: SignupViewModel,
    takenActions: SignupEmailTakenActions,
    modifier: Modifier = Modifier,
) {
    val message = state.messageFor(SignupField.EMAIL)
    val errorText = fieldMessageText(SignupField.EMAIL, message)
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        AuthTextField(
            value = state.form.email,
            onValueChange = viewModel::onEmailChange,
            title = stringResource(R.string.signup_email_placeholder),
            icon = MeeshyIcons.Mail,
            contentType = AuthContentType.Email,
            imeAction = ImeAction.Next,
            enabled = !state.isLocked,
            errorText = errorText,
            modifier = Modifier.testTag(SIGNUP_EMAIL_TAG),
        )
        ErrorHaptic(errorText)
        // Une adresse déjà prise n'est pas une faute de frappe : « Est-ce vous ? », ses gestes valent pour CETTE adresse.
        SignupEmailTakenBlock(state = state, actions = takenActions)
    }
}

/**
 * « S'inscrire » : dégradé de marque pleine largeur, ACTIF dès la carte et un formulaire prêt,
 * à 0,6 d'opacité sinon — inactif à l'œil, jamais sourd au doigt : le toucher fait dire au
 * numéro son refus ([SignupViewModel.register]).
 */
@Composable
private fun SignupPrimaryButton(state: SignupUiState, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val action = state.primaryAction
    val title = stringResource(
        if (action is SignupPrimaryAction.Talk) R.string.signup_talk else R.string.signup_phased_submit,
    )
    val inProgress = stringResource(R.string.signup_submit_in_progress)
    val active = action is SignupPrimaryAction.Talk || (action as? SignupPrimaryAction.SignUp)?.enabled == true
    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = PRIMARY_MIN_HEIGHT)
            .testTag(SIGNUP_PRIMARY_TAG)
            .alpha(if (active || state.isSubmitting) 1f else INACTIVE_ALPHA)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(Brush.linearGradient(MeeshyPalette.BrandGradient))
            .clickable(enabled = !state.isSubmitting && !state.isValidating, role = Role.Button, onClick = onClick)
            .semantics {
                contentDescription = title
                if (state.isSubmitting) stateDescription = inProgress
            },
        contentAlignment = Alignment.Center,
    ) {
        if (state.isSubmitting) {
            CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = MeeshyPalette.White)
        } else {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MeeshyPalette.White,
            )
        }
    }
}

private const val SIGNUP_CODE_ENTRY_KEY = "signup-code"

/** La saisie du code dans la carte : son ViewModel est celui de l'écran du code, une instance par écran d'inscription. */
@Composable
private fun SignupCodeHost(step: SignupCodeStep, viewModel: SignupViewModel, entry: EmailVerificationViewModel) {
    SignupCodeStepContent(
        step = step,
        entry = entry,
        onVerified = viewModel::onCodeVerified,
        onProvenElsewhere = viewModel::onLinkOpenedElsewhere,
    )
}

/**
 * La langue de lecture, annoncée plutôt que demandée : elle est déjà déduite de
 * l'appareil, et « Changer » n'est là que pour la minorité qui lit dans une
 * autre langue que celle de son téléphone.
 */
@Composable
private fun LanguagePill(state: SignupUiState, viewModel: SignupViewModel) {
    var showLanguagePicker by remember { mutableStateOf(false) }
    val code = state.form.systemLanguage
    val languageName = remember(code) { LanguageStepSelection.selectedLanguageName(code) }
    val flag = remember(code) { LanguageData.info(code)?.flag.orEmpty() }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .padding(
                start = MeeshySpacing.md,
                end = MeeshySpacing.xs,
                top = MeeshySpacing.xs,
                bottom = MeeshySpacing.xs,
            ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(text = flag, style = MaterialTheme.typography.bodyLarge)
        Text(
            text = stringResource(R.string.signup_language_pill, languageName),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f),
        )
        // Un vrai bouton, pas un texte cliquable : c'est lui qui porte le rôle
        // annoncé au lecteur d'écran et la cible tactile de 48 dp.
        TextButton(onClick = { showLanguagePicker = true }, enabled = !state.isSubmitting) {
            Text(
                text = stringResource(R.string.signup_language_change),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyPalette.Indigo500,
            )
        }
    }

    if (showLanguagePicker) {
        LanguagePickerSheet(
            selectedCode = code,
            onSelect = { picked ->
                viewModel.onSystemLanguageChange(picked)
                showLanguagePicker = false
            },
            onDismiss = { showLanguagePicker = false },
        )
    }
}


@Composable
private fun GlobalErrorBanner(error: SignupSubmitError?) {
    val text = when (error) {
        null, is SignupSubmitError.Field -> null
        SignupSubmitError.Network -> stringResource(R.string.signup_error_network)
        is SignupSubmitError.Global -> stringResource(SignupRefusalCopy.globalRefusal(error))
    }
    AuthErrorMessage(text = text, boxed = true)
}


/**
 * La phrase légale, puis les deux documents qu'elle nomme, chacun derrière son
 * propre bouton — la loi 4 : un texte qui nomme un document doit permettre de
 * l'ouvrir. Ils mènent aux écrans `settings/legal/{terms,privacy}` déjà livrés,
 * pas à une copie de plus.
 */
@Composable
private fun LegalNotice(onOpenTerms: () -> Unit, onOpenPrivacy: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = stringResource(R.string.signup_legal),
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            TextButton(onClick = onOpenTerms) {
                Text(
                    text = stringResource(R.string.signup_legal_terms),
                    style = MaterialTheme.typography.labelSmall,
                    color = MeeshyPalette.Indigo500,
                )
            }
            TextButton(onClick = onOpenPrivacy) {
                Text(
                    text = stringResource(R.string.signup_legal_privacy),
                    style = MaterialTheme.typography.labelSmall,
                    color = MeeshyPalette.Indigo500,
                )
            }
        }
    }
}


@Composable
private fun SignInPrompt(enabled: Boolean, onSignIn: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(R.string.signup_have_account),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
        )
        TextButton(onClick = onSignIn, enabled = enabled, modifier = Modifier.testTag(SIGNUP_SIGN_IN_TAG)) {
            Text(
                text = stringResource(R.string.signup_sign_in),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}
