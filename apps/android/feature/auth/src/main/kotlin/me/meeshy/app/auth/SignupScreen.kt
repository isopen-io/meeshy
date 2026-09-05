@file:OptIn(ExperimentalComposeUiApi::class, ExperimentalMaterial3Api::class)

package me.meeshy.app.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.AutofillType
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.auth.LanguageStepSelection
import me.meeshy.sdk.model.auth.SignupField
import me.meeshy.sdk.model.auth.SignupFieldIssue
import me.meeshy.sdk.model.auth.SignupFieldMessage
import me.meeshy.sdk.model.auth.SignupRefusal
import me.meeshy.sdk.model.auth.SignupSubmitError
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.modifier.autofill
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La création de compte : UN écran, aucun délai, aucune vérification préalable.
 *
 * Il remplace un assistant en huit étapes. Ce que l'utilisateur y gagne n'est
 * pas seulement sept écrans de moins : plus rien n'attend entre sa dernière
 * frappe et le bouton — pas de sonde de disponibilité, pas de verdict serveur à
 * franchir pour passer au champ suivant — et aucun refus ne lui parvient sept
 * écrans après le champ fautif : chacun se pose SOUS son champ.
 *
 * L'écran ne décide de rien. Le verdict local, l'état du bouton et le message
 * de chaque champ sont projetés par [SignupUiState] au-dessus des cœurs purs
 * `SignupForm` / `SignupFieldMessages` ; l'écran choisit seulement les mots.
 *
 * Le remplissage automatique est câblé sur les quatre saisies que le système
 * sait servir (nom, e-mail, téléphone, nouveau mot de passe) via le
 * modificateur partagé [autofill].
 */
@Composable
fun SignupScreen(
    onClose: () -> Unit,
    onRegistered: () -> Unit,
    onOpenTerms: () -> Unit = {},
    onOpenPrivacy: () -> Unit = {},
    viewModel: SignupViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(state.isRegistered) {
        if (state.isRegistered) onRegistered()
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
                    title = {},
                    navigationIcon = {
                        IconButton(onClick = onClose) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.signup_back),
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
                    .imePadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                SignupHeader()
                DisplayNameField(state = state, viewModel = viewModel)
                EmailField(state = state, viewModel = viewModel, onSignIn = onClose)
                PhoneField(state = state, viewModel = viewModel)
                PasswordField(state = state, viewModel = viewModel)
                LanguagePill(state = state, viewModel = viewModel)
                GlobalErrorBanner(error = state.globalError)
                MeeshyPrimaryButton(
                    text = stringResource(R.string.signup_submit),
                    onClick = viewModel::register,
                    enabled = state.canSubmit,
                    loading = state.isSubmitting,
                    modifier = Modifier.fillMaxWidth(),
                )
                LegalNotice(onOpenTerms = onOpenTerms, onOpenPrivacy = onOpenPrivacy)
                SignInPrompt(enabled = !state.isSubmitting, onSignIn = onClose)
            }
        }
    }
}

@Composable
private fun SignupHeader() {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Text(
            text = stringResource(R.string.signup_title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(
            text = stringResource(R.string.signup_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

@Composable
private fun DisplayNameField(state: SignupUiState, viewModel: SignupViewModel) {
    val message = state.messageFor(SignupField.DISPLAY_NAME)
    OutlinedTextField(
        value = state.form.displayName,
        onValueChange = viewModel::onDisplayNameChange,
        label = { Text(stringResource(R.string.signup_display_name_label)) },
        singleLine = true,
        enabled = !state.isSubmitting,
        isError = message != null,
        supportingText = fieldSupportingText(message),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
        modifier = Modifier
            .fillMaxWidth()
            .autofill(listOf(AutofillType.PersonFullName), viewModel::onDisplayNameChange),
    )
}

@Composable
private fun EmailField(state: SignupUiState, viewModel: SignupViewModel, onSignIn: () -> Unit) {
    val message = state.messageFor(SignupField.EMAIL)
    val emailTaken = (message as? SignupFieldMessage.Refused)?.refusal == SignupRefusal.EMAIL_TAKEN
    OutlinedTextField(
        value = state.form.email,
        onValueChange = viewModel::onEmailChange,
        label = { Text(stringResource(R.string.signup_email_label)) },
        singleLine = true,
        enabled = !state.isSubmitting,
        isError = message != null,
        // Une adresse déjà prise n'est pas une faute de frappe : la sortie est de
        // se connecter, et elle doit être à portée du doigt, sous le champ.
        supportingText = fieldSupportingText(message, action = if (emailTaken) onSignIn else null),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
        modifier = Modifier
            .fillMaxWidth()
            .autofill(listOf(AutofillType.EmailAddress), viewModel::onEmailChange),
    )
}

@Composable
private fun PhoneField(state: SignupUiState, viewModel: SignupViewModel) {
    var showCountryPicker by remember { mutableStateOf(false) }
    val countries = rememberCountryCatalog()
    val country = remember(state.form.dialCountryIso, countries) {
        selectedCountry(state.form.dialCountryIso, countries)
    }
    val message = state.messageFor(SignupField.PHONE)
    val chooseCountryLabel = stringResource(R.string.signup_choose_country)

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.Top,
    ) {
        Row(
            modifier = Modifier
                .padding(top = MeeshySpacing.sm)
                .clip(RoundedCornerShape(MeeshyRadius.sm))
                .background(MeeshyTheme.tokens.backgroundSecondary)
                .clickable(enabled = !state.isSubmitting) { showCountryPicker = true }
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.md)
                .semantics { contentDescription = chooseCountryLabel },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Text(text = country.flag, style = MaterialTheme.typography.bodyLarge)
            Text(
                text = country.dialCode,
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textPrimary,
            )
        }
        OutlinedTextField(
            value = state.form.phoneDigits,
            onValueChange = viewModel::onPhoneEntryChange,
            label = { Text(stringResource(R.string.signup_phone_label)) },
            singleLine = true,
            enabled = !state.isSubmitting,
            isError = message != null,
            supportingText = fieldSupportingText(message),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Next),
            modifier = Modifier
                .weight(1f)
                .autofill(listOf(AutofillType.PhoneNumber), viewModel::onPhoneEntryChange),
        )
    }

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
private fun PasswordField(state: SignupUiState, viewModel: SignupViewModel) {
    var visible by remember { mutableStateOf(false) }
    val message = state.messageFor(SignupField.PASSWORD)
    OutlinedTextField(
        value = state.form.password,
        onValueChange = viewModel::onPasswordChange,
        label = { Text(stringResource(R.string.signup_password_label)) },
        singleLine = true,
        enabled = !state.isSubmitting,
        isError = message != null,
        supportingText = fieldSupportingText(message),
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { viewModel.register() }),
        trailingIcon = {
            IconButton(onClick = { visible = !visible }) {
                Icon(
                    imageVector = if (visible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                    contentDescription = stringResource(
                        if (visible) R.string.signup_password_hide else R.string.signup_password_show,
                    ),
                    tint = MeeshyTheme.tokens.textSecondary,
                )
            }
        },
        modifier = Modifier
            .fillMaxWidth()
            .autofill(listOf(AutofillType.NewPassword), viewModel::onPasswordChange),
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
        null -> return
        SignupSubmitError.Network -> stringResource(R.string.signup_error_network)
        is SignupSubmitError.Global -> error.message ?: stringResource(R.string.signup_error_generic)
        is SignupSubmitError.Field -> return
    }
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyTheme.tokens.error,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(MeeshyTheme.tokens.error.copy(alpha = 0.10f))
            .padding(MeeshySpacing.sm),
    )
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
        TextButton(onClick = onSignIn, enabled = enabled) {
            Text(
                text = stringResource(R.string.signup_sign_in),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

/**
 * Le `supportingText` d'un champ : le refus, plus l'issue quand il en a une.
 *
 * Rend `null` quand il n'y a rien à dire, pour que le champ ne réserve pas une
 * ligne vide sous lui — un formulaire de cinq champs qui respire de six lignes
 * fantômes n'est pas aéré, il est lâche.
 */
@Composable
private fun fieldSupportingText(
    message: SignupFieldMessage?,
    action: (() -> Unit)? = null,
): (@Composable () -> Unit)? {
    val text = fieldMessageText(message) ?: return null
    val actionLabel = if (action != null) stringResource(R.string.signup_sign_in) else null
    return {
        Column {
            Text(text = text, style = MaterialTheme.typography.bodySmall)
            if (actionLabel != null) {
                Text(
                    text = actionLabel,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyPalette.Indigo500,
                    modifier = Modifier
                        .clickable { action?.invoke() }
                        .padding(vertical = MeeshySpacing.xs),
                )
            }
        }
    }
}

/**
 * Le texte d'un message de champ.
 *
 * Un refus TYPÉ est rendu dans NOS mots : la passerelle répond dans sa langue,
 * pas dans celle du lecteur, et « ce numéro est déjà rattaché à un compte » doit
 * se lire dans la langue de l'écran. Seule une violation de validation
 * ([SignupRefusal.INVALID]) préfère le texte du serveur — lui seul sait ce qui
 * n'allait pas — avec un repli générique s'il n'en donne aucun.
 */
@Composable
private fun fieldMessageText(message: SignupFieldMessage?): String? = when (message) {
    null -> null
    is SignupFieldMessage.Local -> stringResource(message.issue.labelRes())
    is SignupFieldMessage.Refused -> when (message.refusal) {
        SignupRefusal.PHONE_OWNERSHIP_CONFLICT -> stringResource(R.string.signup_phone_conflict)
        SignupRefusal.PHONE_INVALID -> stringResource(R.string.signup_phone_invalid)
        SignupRefusal.EMAIL_TAKEN -> stringResource(R.string.signup_email_taken)
        SignupRefusal.NAME_TAKEN -> stringResource(R.string.signup_display_name_taken)
        SignupRefusal.INVALID -> message.serverMessage ?: stringResource(R.string.signup_error_invalid_field)
    }
}

private fun SignupFieldIssue.labelRes(): Int = when (this) {
    SignupFieldIssue.DISPLAY_NAME_REQUIRED -> R.string.signup_display_name_required
    SignupFieldIssue.DISPLAY_NAME_TOO_LONG -> R.string.signup_display_name_too_long
    SignupFieldIssue.EMAIL_INVALID -> R.string.signup_email_invalid
    SignupFieldIssue.PASSWORD_TOO_SHORT -> R.string.signup_password_too_short
}
