package me.meeshy.app.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.AuthFieldBorder
import me.meeshy.sdk.model.auth.AuthFieldBorderRole
import me.meeshy.ui.component.auth.AuthContentType
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.auth.AuthTextField
import me.meeshy.ui.component.auth.FireworksCanvas
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val SIGNUP_CARD_TAG: String = "signup.card"
internal const val SIGNUP_DISPLAY_NAME_TAG: String = "signup.card.displayName"
internal const val SIGNUP_USERNAME_TAG: String = "signup.card.username"
internal const val SIGNUP_PASSWORD_TAG: String = "signup.card.password"
internal const val SIGNUP_VALIDATE_NOW_TAG: String = "signup.card.validateNow"
internal const val SIGNUP_FIREWORKS_TAG: String = "signup.card.fireworks"

private val INPUT_MIN_HEIGHT = 48.dp
private val TAP_TARGET = 48.dp
private const val INACTIVE_ALPHA = 0.6f
private const val VALIDATE_TINT = 0.12f
private const val VALIDATE_STROKE = 0.4f

/** Ce que la carte demande à son hôte — des rappels, jamais le ViewModel lui-même. */
internal class SignupCardActions(
    val onDisplayNameChange: (String) -> Unit,
    val onUsernameChange: (String) -> Unit,
    val onSuggestionPicked: (String) -> Unit,
    val onPasswordChange: (String) -> Unit,
    val onSubmit: () -> Unit,
    val onValidateNow: () -> Unit = {},
    val onSignIn: () -> Unit = {},
)

/**
 * La carte « Votre compte » (iOS `SignupView+Card.identityCard`) : une surface de verre au
 * liseré `inputBorder`, qui porte le nom affiché et le @pseudo pré-dérivés de l'adresse — tous
 * deux modifiables, le refus du pseudo dit EN DIRECT pendant la frappe — puis, une fois
 * l'identité définie, le mot de passe facultatif et son aide.
 */
@Composable
internal fun SignupIdentityCard(
    state: SignupUiState,
    actions: SignupCardActions,
    modifier: Modifier = Modifier,
    codeStep: @Composable (SignupCodeStep) -> Unit = {},
) {
    val tokens = MeeshyTheme.tokens
    val shape = RoundedCornerShape(MeeshyRadius.xxl)
    val celebrating = state.card is SignupCard.Verified && !LocalReduceMotion.current
    MeeshyGlassSurface(shape = shape, modifier = modifier.fillMaxWidth().testTag(SIGNUP_CARD_TAG)) {
        Box {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(BorderStroke(1.dp, tokens.inputBorder.copy(alpha = AuthFieldBorder.IDLE_ALPHA)), shape)
                    .padding(MeeshySpacing.lg)
                    .animateContentSize(),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                when (val card = state.card) {
                    SignupCard.Editing -> {
                        IdentityInputs(state, actions)
                        AnimatedVisibility(visible = state.passwordRevealed) {
                            SignupPasswordBlock(state, actions)
                        }
                        ValidateNowButton(state, actions.onValidateNow)
                    }
                    is SignupCard.AwaitingCode -> codeStep(card.step)
                    is SignupCard.Verified -> SignupVerifiedStep(
                        openRefused = state.openRefused,
                        needsSignIn = state.needsSignIn,
                        onSignIn = actions.onSignIn,
                    )
                }
            }
            // Le feu d'artifice se clippe à la forme de la carte et se tait sous « Réduire les animations ».
            if (celebrating) {
                Box(Modifier.matchParentSize().testTag(SIGNUP_FIREWORKS_TAG)) { FireworksCanvas(clip = shape) }
            }
        }
    }
}

/** « Valider mon compte maintenant » : crée le compte en TENANT sa session et fait paraître le code dans la carte. */
@Composable
private fun ValidateNowButton(state: SignupUiState, onClick: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    val title = stringResource(R.string.signup_validate_now)
    val inProgress = stringResource(R.string.signup_submit_in_progress)
    val shape = RoundedCornerShape(MeeshyRadius.md)
    val ready = state.canSubmit
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = INPUT_MIN_HEIGHT)
            .testTag(SIGNUP_VALIDATE_NOW_TAG)
            .alpha(if (ready || state.isValidating) 1f else INACTIVE_ALPHA)
            .background(MeeshyPalette.Indigo500.copy(alpha = VALIDATE_TINT), shape)
            .border(BorderStroke(1.dp, MeeshyPalette.Indigo500.copy(alpha = VALIDATE_STROKE)), shape)
            .clip(shape)
            .clickable(enabled = !state.isValidating && !state.isSubmitting, role = Role.Button, onClick = onClick)
            .semantics {
                contentDescription = title
                if (state.isValidating) stateDescription = inProgress
            },
        contentAlignment = Alignment.Center,
    ) {
        if (state.isValidating) {
            CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = MeeshyPalette.Indigo500)
        } else {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                color = tokens.textPrimary,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = MeeshySpacing.md),
            )
        }
    }
}

@Composable
private fun IdentityInputs(state: SignupUiState, actions: SignupCardActions) {
    val nameError = displayNameErrorText(state)
    val usernameError = usernameErrorText(state)
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SignupIdentityInput(
            value = state.displayNameInput,
            onValueChange = actions.onDisplayNameChange,
            label = stringResource(R.string.signup_identity_display_name),
            placeholder = state.displayNamePlaceholder,
            prefix = null,
            errorText = nameError,
            enabled = !state.isSubmitting,
            modifier = Modifier.testTag(SIGNUP_DISPLAY_NAME_TAG),
        )
        SignupIdentityInput(
            value = state.usernameInput,
            onValueChange = actions.onUsernameChange,
            label = stringResource(R.string.signup_identity_username),
            placeholder = state.usernamePlaceholder,
            prefix = "@",
            errorText = usernameError,
            enabled = !state.isSubmitting,
            modifier = Modifier.testTag(SIGNUP_USERNAME_TAG),
        )
        UsernameSuggestions(state.usernameSuggestions, actions.onSuggestionPicked)
    }
}

/**
 * Une saisie d'identité, TOUJOURS ouverte : un toucher suffit pour la modifier. Le libellé
 * est au-dessus, le refus en rouge dessous avec sa secousse. Un champ blanc montre en filigrane
 * la valeur qui partira à sa place (la dérivation de l'adresse), jamais un champ vide qui en cache une.
 */
@Composable
private fun SignupIdentityInput(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    placeholder: String,
    prefix: String?,
    errorText: String?,
    enabled: Boolean,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    val border = AuthFieldBorder.resolve(isFocused = isFocused, hasError = errorText != null)
    val borderColor = when (border.role) {
        AuthFieldBorderRole.BRAND -> MeeshyPalette.Indigo500
        AuthFieldBorderRole.ERROR -> tokens.error
        AuthFieldBorderRole.INPUT -> tokens.inputBorder
    }.let { it.copy(alpha = it.alpha * border.alpha) }
    val shape = RoundedCornerShape(MeeshyRadius.md)

    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Medium,
            color = tokens.textMuted,
            modifier = Modifier.clearAndSetSemantics { },
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = INPUT_MIN_HEIGHT)
                .background(tokens.inputBackground, shape)
                .border(BorderStroke(1.dp, borderColor), shape)
                .padding(horizontal = MeeshySpacing.lg),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            if (prefix != null) {
                Text(
                    text = prefix,
                    style = MaterialTheme.typography.bodyLarge,
                    color = tokens.textMuted,
                    modifier = Modifier.clearAndSetSemantics { },
                )
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = modifier
                    .weight(1f)
                    .semantics { contentDescription = label; errorText?.let { error(it) } },
                enabled = enabled,
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = tokens.textPrimary),
                cursorBrush = SolidColor(MeeshyPalette.Indigo500),
                keyboardOptions = KeyboardOptions(
                    capitalization = if (prefix == null) KeyboardCapitalization.Words else KeyboardCapitalization.None,
                    autoCorrectEnabled = false,
                    imeAction = ImeAction.Next,
                ),
                interactionSource = interactionSource,
                decorationBox = { inner ->
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
                        if (value.isBlank()) {
                            Text(
                                text = placeholder.ifEmpty { label },
                                style = MaterialTheme.typography.bodyLarge,
                                color = tokens.textMuted,
                            )
                        }
                        inner()
                    }
                },
            )
        }
        if (errorText != null) {
            Text(text = errorText, style = MaterialTheme.typography.labelSmall, color = tokens.error)
        }
        ErrorHaptic(errorText)
    }
}

@Composable
private fun UsernameSuggestions(candidates: List<String>, onPick: (String) -> Unit) {
    if (candidates.isEmpty()) return
    Row(
        modifier = Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        candidates.forEach { candidate ->
            Box(
                modifier = Modifier
                    .heightIn(min = TAP_TARGET)
                    .background(MeeshyTheme.tokens.inputBackground, RoundedCornerShape(MeeshyRadius.md))
                    .clickable(role = Role.Button) { onPick(candidate) }
                    .padding(horizontal = MeeshySpacing.md),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "@$candidate",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyPalette.Indigo500,
                )
            }
        }
    }
}

/**
 * Le mot de passe, FACULTATIF : il paraît quand l'identité est définie et ne se referme
 * plus. Sa conséquence se lit sous le champ, au repos : sans mot de passe, la connexion passe par un lien reçu par e-mail.
 */
@Composable
private fun SignupPasswordBlock(state: SignupUiState, actions: SignupCardActions) {
    val passwordError = state.validation.password
        ?.let { stringResource(R.string.signup_password_too_short) }
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        AuthTextField(
            value = state.form.password,
            onValueChange = actions.onPasswordChange,
            title = stringResource(R.string.signup_password_placeholder),
            icon = MeeshyIcons.Lock,
            isSecure = true,
            contentType = AuthContentType.NewPassword,
            imeAction = ImeAction.Go,
            onImeAction = actions.onSubmit,
            enabled = !state.isSubmitting,
            errorText = passwordError,
            modifier = Modifier.testTag(SIGNUP_PASSWORD_TAG),
        )
        ErrorHaptic(passwordError)
        Text(
            text = stringResource(R.string.signup_password_why_detail),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}
