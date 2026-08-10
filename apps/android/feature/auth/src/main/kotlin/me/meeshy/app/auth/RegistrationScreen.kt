package me.meeshy.app.auth

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AlternateEmail
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SuggestionChip
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import me.meeshy.feature.auth.R
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.LanguageInfo
import me.meeshy.sdk.model.PasswordEntry
import me.meeshy.sdk.model.PasswordRequirements
import me.meeshy.sdk.model.PasswordRequirementsState
import me.meeshy.sdk.model.PasswordStrength
import me.meeshy.sdk.model.PasswordStrengthLevel
import me.meeshy.sdk.model.auth.Country
import me.meeshy.sdk.model.auth.CountryCatalog
import me.meeshy.sdk.model.auth.LanguageSelectionState
import me.meeshy.sdk.model.auth.LanguageSlot
import me.meeshy.sdk.model.auth.LanguageStepSelection
import me.meeshy.sdk.model.auth.RegistrationLeadingAction
import me.meeshy.sdk.model.auth.RegistrationNavModel
import me.meeshy.sdk.model.auth.RegistrationPrimaryAction
import me.meeshy.sdk.model.auth.RegistrationPrimaryLabel
import me.meeshy.sdk.model.auth.RegistrationStep
import me.meeshy.sdk.model.auth.RegistrationStepContent
import me.meeshy.sdk.model.auth.RegistrationSummaryRow
import me.meeshy.sdk.model.auth.StepFill
import me.meeshy.sdk.model.auth.SummaryField
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.util.Locale

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
 * Every [RegistrationStep] now has real field UI (slices `auth-onboarding-shell`,
 * `auth-phone-step-fields`, `auth-email-step-fields`, `auth-identity-step-fields`,
 * `auth-password-step-fields`, `auth-language-step-fields`, `auth-profile-step-fields`,
 * `auth-recap-step-fields`) — the `else -> Unit` branch below is now permanently dead code kept
 * only as a guard against a future 9th step landing without its own arm.
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
                        RegistrationStep.PHONE -> PhoneStepBody(state = state, viewModel = viewModel)
                        RegistrationStep.EMAIL -> EmailStepBody(state = state, viewModel = viewModel)
                        RegistrationStep.IDENTITY -> IdentityStepBody(state = state, viewModel = viewModel)
                        RegistrationStep.PASSWORD -> PasswordStepBody(state = state, viewModel = viewModel)
                        RegistrationStep.LANGUAGE -> LanguageStepBody(state = state, viewModel = viewModel)
                        RegistrationStep.PROFILE -> ProfileStepBody(state = state, viewModel = viewModel)
                        RegistrationStep.RECAP -> RecapStepBody(state = state, viewModel = viewModel)
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
        if (state.fields.usernameSuggestions.isNotEmpty()) {
            UsernameSuggestionStrip(
                suggestions = state.fields.usernameSuggestions,
                onSuggestionClick = viewModel::selectUsernameSuggestion,
            )
        }
    }
}

/**
 * Parity target: iOS `StepPseudoView.suggestionsCard` — free alternate handles the
 * server offers when the typed username is taken
 * ([me.meeshy.sdk.model.auth.RegistrationFields.usernameSuggestions]). A tap adopts
 * the handle via [RegistrationViewModel.selectUsernameSuggestion]. `FlowRow` (stable
 * since Compose Foundation 1.7, already used elsewhere in this codebase e.g. the
 * chat effects picker) replaces iOS's hand-rolled `FlowLayout`.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun UsernameSuggestionStrip(suggestions: List<String>, onSuggestionClick: (String) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.sm)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyTheme.tokens.warning.copy(alpha = 0.08f))
            .padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Icon(
                imageVector = Icons.Filled.Lightbulb,
                contentDescription = null,
                tint = MeeshyTheme.tokens.warning,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = stringResource(R.string.registration_username_suggestions_title),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            suggestions.forEach { suggestion ->
                SuggestionChip(
                    onClick = { onSuggestionClick(suggestion) },
                    label = { Text("@$suggestion") },
                )
            }
        }
    }
}

/**
 * EMAIL step — parity target: iOS `StepEmailView`
 * (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`): a single
 * email field with the availability indicator (mirrors [PseudoStepBody]'s
 * pattern). Unlike PHONE, EMAIL has no skip affordance on either iOS or Android
 * — [me.meeshy.sdk.model.auth.RegistrationStepGate.canProceed]'s EMAIL arm always
 * requires a confirmed-available address, and [RegistrationNavModel.showSkip] is
 * `false` for every step but PROFILE.
 */
@Composable
private fun EmailStepBody(state: RegistrationUiState, viewModel: RegistrationViewModel) {
    Column(
        modifier = Modifier.padding(top = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            text = stringResource(R.string.registration_email_header),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(
            text = stringResource(R.string.registration_email_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        OutlinedTextField(
            value = state.fields.email,
            onValueChange = viewModel::onEmailChange,
            label = { Text(stringResource(R.string.registration_email_label)) },
            singleLine = true,
            enabled = !state.isSubmitting,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md),
        )
        state.fields.emailAvailable?.let { available ->
            val (text, color) = if (available) {
                stringResource(R.string.registration_email_available) to MeeshyPalette.Success
            } else {
                stringResource(R.string.registration_email_taken) to MeeshyPalette.Error
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

/**
 * PHONE step — parity target: iOS `StepPhoneView`
 * (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`): a
 * country-dial-code button opening a searchable picker, the phone digits field,
 * the availability indicator (mirrors [PseudoStepBody]'s pattern), and an
 * in-content skip affordance (iOS renders "Passer cette étape" inline here too,
 * not just on the PROFILE step's bottom bar — [RegistrationNavModel.showSkip]
 * is deliberately `false` for PHONE, see its KDoc). The phone-ownership
 * recovery hint iOS shows on a taken number is a distinct, larger capability
 * (needs its own decision core) and is deliberately out of scope here.
 */
@Composable
private fun PhoneStepBody(state: RegistrationUiState, viewModel: RegistrationViewModel) {
    var showCountryPicker by remember { mutableStateOf(false) }
    val countries = remember { CountryCatalog.build(::countryDisplayName) }
    val selected = remember(state.fields.countryIso, countries) {
        countries.firstOrNull { it.iso == state.fields.countryIso }
            ?: Country(
                iso = state.fields.countryIso,
                name = state.fields.countryIso,
                dialCode = CountryCatalog.dialCode(state.fields.countryIso).orEmpty(),
                flag = CountryCatalog.flag(state.fields.countryIso),
            )
    }

    Column(
        modifier = Modifier.padding(top = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            text = stringResource(R.string.registration_phone_header),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(
            text = stringResource(R.string.registration_phone_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            val chooseCountryLabel = stringResource(R.string.registration_phone_choose_country)
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .background(MeeshyTheme.tokens.backgroundSecondary)
                    .clickable(enabled = !state.isSubmitting) { showCountryPicker = true }
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.md)
                    .semantics { contentDescription = chooseCountryLabel },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                Text(text = selected.flag, style = MaterialTheme.typography.bodyLarge)
                Text(
                    text = selected.dialCode,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyTheme.tokens.textPrimary,
                )
            }
            OutlinedTextField(
                value = state.fields.phoneNumber,
                onValueChange = viewModel::onPhoneChange,
                label = { Text(stringResource(R.string.registration_phone_number_label)) },
                singleLine = true,
                enabled = !state.isSubmitting,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.weight(1f),
            )
        }
        state.fields.phoneAvailable?.let { available ->
            val (text, color) = if (available) {
                stringResource(R.string.registration_phone_available) to MeeshyPalette.Success
            } else {
                stringResource(R.string.registration_phone_taken) to MeeshyPalette.Error
            }
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                color = color,
                modifier = Modifier.padding(top = MeeshySpacing.xs),
            )
        }
        TextButton(
            onClick = viewModel::skip,
            modifier = Modifier.padding(top = MeeshySpacing.sm),
        ) {
            Text(
                text = stringResource(R.string.registration_skip_step),
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }

    if (showCountryPicker) {
        CountryPickerSheet(
            countries = countries,
            onSelect = { country ->
                viewModel.onCountryChange(country.iso)
                showCountryPicker = false
            },
            onDismiss = { showCountryPicker = false },
        )
    }
}

/** `java.util.Locale`-backed display-name resolver injected into [CountryCatalog.build]. */
private fun countryDisplayName(iso: String): String = Locale("", iso).displayCountry

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CountryPickerSheet(
    countries: List<Country>,
    onSelect: (Country) -> Unit,
    onDismiss: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val filtered = remember(query, countries) { CountryCatalog.search(query, countries) }

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = MeeshyTheme.tokens.backgroundPrimary) {
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg)) {
            Text(
                text = stringResource(R.string.registration_phone_country_picker_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.padding(bottom = MeeshySpacing.sm),
            )
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                singleLine = true,
                placeholder = { Text(stringResource(R.string.registration_phone_country_search_hint)) },
                modifier = Modifier.fillMaxWidth(),
            )
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 420.dp)
                    .padding(vertical = MeeshySpacing.sm),
            ) {
                items(filtered, key = { it.iso }) { country ->
                    val rowLabel = CountryCatalog.accessibilityLabel(country)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelect(country) }
                            .padding(vertical = MeeshySpacing.sm)
                            .semantics { contentDescription = rowLabel },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                    ) {
                        Text(text = country.flag, style = MaterialTheme.typography.titleMedium)
                        Text(
                            text = country.name,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MeeshyTheme.tokens.textPrimary,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            text = country.dialCode,
                            style = MaterialTheme.typography.bodySmall,
                            color = MeeshyTheme.tokens.textSecondary,
                        )
                    }
                }
            }
        }
    }
}

/**
 * IDENTITY step — parity target: iOS `StepIdentityView`
 * (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`): a
 * first-name field and a last-name field, no availability probe (the gate is
 * purely local — [me.meeshy.sdk.model.auth.RegistrationStepGate.canProceed]'s
 * IDENTITY arm just requires both non-blank) and no skip affordance
 * ([RegistrationNavModel.showSkip] is `false` for every step but PROFILE).
 */
@Composable
private fun IdentityStepBody(state: RegistrationUiState, viewModel: RegistrationViewModel) {
    Column(
        modifier = Modifier.padding(top = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            text = stringResource(R.string.registration_identity_header),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(
            text = stringResource(R.string.registration_identity_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        OutlinedTextField(
            value = state.fields.firstName,
            onValueChange = viewModel::onFirstNameChange,
            label = { Text(stringResource(R.string.registration_identity_first_name_label)) },
            singleLine = true,
            enabled = !state.isSubmitting,
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md),
        )
        OutlinedTextField(
            value = state.fields.lastName,
            onValueChange = viewModel::onLastNameChange,
            label = { Text(stringResource(R.string.registration_identity_last_name_label)) },
            singleLine = true,
            enabled = !state.isSubmitting,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/**
 * PASSWORD step — parity target: iOS `StepPasswordView`
 * (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`): a
 * password field, a live strength meter once the field is non-empty, a confirm
 * field once the password reaches the minimum length, a match/mismatch verdict
 * once the confirm field is non-empty, and the four-row requirements checklist.
 * Every decision is driven by the already-shipped pure cores —
 * [PasswordEntry] (confirm-field reveal + match verdict + proceed gate),
 * [PasswordRequirements] (the checklist rows) and [PasswordStrength] (the
 * meter score, already shipped and used verbatim by `ChangePasswordScreen`,
 * `:feature:settings` — reused here rather than re-implemented, same 6-band
 * scoring as iOS `PasswordStrengthIndicator`). No skip affordance
 * ([RegistrationNavModel.showSkip] is PROFILE-only, mirrors iOS having none
 * for this step either).
 */
@Composable
private fun PasswordStepBody(state: RegistrationUiState, viewModel: RegistrationViewModel) {
    val password = state.fields.password
    val confirm = state.fields.confirmPassword
    val entry = remember(password, confirm) { PasswordEntry.evaluate(password, confirm) }
    val requirements = remember(password) { PasswordRequirements.evaluate(password) }

    Column(
        modifier = Modifier.padding(top = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            text = stringResource(R.string.registration_password_header),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(
            text = stringResource(R.string.registration_password_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        PasswordField(
            value = password,
            onValueChange = viewModel::onPasswordChange,
            label = stringResource(R.string.registration_password_label),
            enabled = !state.isSubmitting,
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md),
        )
        if (password.isNotEmpty()) {
            PasswordStrengthMeter(level = PasswordStrength.evaluate(password))
        }
        if (entry.showConfirmField) {
            PasswordField(
                value = confirm,
                onValueChange = viewModel::onConfirmPasswordChange,
                label = stringResource(R.string.registration_password_confirm_label),
                enabled = !state.isSubmitting,
                modifier = Modifier.fillMaxWidth(),
            )
            if (confirm.isNotEmpty()) {
                PasswordMatchRow(matched = entry.isMatched)
            }
        }
        PasswordRequirementsCard(requirements)
    }
}

@Composable
private fun PasswordField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    enabled: Boolean,
    modifier: Modifier = Modifier,
) {
    var visible by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        enabled = enabled,
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        trailingIcon = {
            IconButton(onClick = { visible = !visible }) {
                Icon(
                    imageVector = if (visible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                    contentDescription = stringResource(
                        if (visible) R.string.registration_password_hide else R.string.registration_password_show,
                    ),
                    tint = MeeshyTheme.tokens.textSecondary,
                )
            }
        },
        modifier = modifier,
    )
}

@Composable
private fun PasswordStrengthMeter(level: PasswordStrengthLevel) {
    val color = level.strengthColor()
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            repeat(PasswordStrength.MAX_SCORE) { index ->
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(if (index < level.score) color else MeeshyTheme.tokens.inputBorder),
                )
            }
        }
        Text(
            text = stringResource(level.strengthLabelRes()),
            style = MaterialTheme.typography.labelSmall,
            color = color,
        )
    }
}

@Composable
private fun PasswordMatchRow(matched: Boolean) {
    val color = if (matched) MeeshyPalette.Success else MeeshyPalette.Error
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(color.copy(alpha = 0.1f))
            .padding(MeeshySpacing.sm),
    ) {
        Icon(
            imageVector = if (matched) Icons.Filled.CheckCircle else Icons.Filled.Cancel,
            contentDescription = null,
            tint = color,
        )
        Text(
            text = stringResource(
                if (matched) R.string.registration_password_match else R.string.registration_password_mismatch,
            ),
            style = MaterialTheme.typography.bodySmall,
            color = color,
        )
    }
}

@Composable
private fun PasswordRequirementsCard(requirements: PasswordRequirementsState) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Text(
            text = stringResource(R.string.registration_password_requirements_title),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textSecondary,
        )
        PasswordRequirementRow(
            met = requirements.length,
            text = stringResource(R.string.registration_password_req_length),
        )
        PasswordRequirementRow(
            met = requirements.uppercase,
            text = stringResource(R.string.registration_password_req_uppercase),
        )
        PasswordRequirementRow(
            met = requirements.lowercase,
            text = stringResource(R.string.registration_password_req_lowercase),
        )
        PasswordRequirementRow(
            met = requirements.digit,
            text = stringResource(R.string.registration_password_req_digit),
        )
    }
}

@Composable
private fun PasswordRequirementRow(met: Boolean, text: String) {
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

private fun PasswordStrengthLevel.strengthColor(): Color = when (this) {
    PasswordStrengthLevel.TOO_WEAK, PasswordStrengthLevel.WEAK -> MeeshyPalette.Error
    PasswordStrengthLevel.MEDIUM, PasswordStrengthLevel.GOOD -> MeeshyPalette.Warning
    PasswordStrengthLevel.STRONG, PasswordStrengthLevel.EXCELLENT -> MeeshyPalette.Success
}

private fun PasswordStrengthLevel.strengthLabelRes(): Int = when (this) {
    PasswordStrengthLevel.TOO_WEAK -> R.string.registration_password_strength_0
    PasswordStrengthLevel.WEAK -> R.string.registration_password_strength_1
    PasswordStrengthLevel.MEDIUM -> R.string.registration_password_strength_2
    PasswordStrengthLevel.GOOD -> R.string.registration_password_strength_3
    PasswordStrengthLevel.STRONG -> R.string.registration_password_strength_4
    PasswordStrengthLevel.EXCELLENT -> R.string.registration_password_strength_5
}

/**
 * LANGUAGE step — parity target: iOS `StepLanguageView`
 * (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`): a
 * searchable system/regional language picker with a summary of each slot's
 * current choice and a live translation-preview example. Every decision (the
 * picker list, the search filter, the summary/preview labels, the slot-aware
 * highlight + write) is driven verbatim by the already-shipped pure
 * [LanguageStepSelection] core (slice `auth-language-step-selection-core`) —
 * this Composable is a thin renderer over it plus
 * [RegistrationViewModel.onSystemLanguageChange] /
 * [RegistrationViewModel.onRegionalLanguageChange]. No skip affordance
 * ([RegistrationNavModel.showSkip] is PROFILE-only, matches iOS having none for
 * this step either). **Deliberate simplification vs iOS:** iOS renders the two
 * slots' current values as a pair of always-visible summary cards *and* a
 * separate pair of tab buttons that switch which slot the grid below edits —
 * here the two roles are merged into one pair of tappable cards (label +
 * current value, tap = both "shows the slot's value" and "activates it for
 * editing"), the same visual information with one fewer redundant control row.
 * Country/language auto-detection from the device locale
 * ([me.meeshy.sdk.model.auth.SignupRegionInference], shipped since
 * `auth-region-language-inference`) stays a distinct, not-yet-wired follow-up —
 * out of scope for this field-UI slice, the same "wiring-only" shape as the
 * steps before it (PHONE similarly ships with a static default country, not
 * device-locale inference).
 */
@Composable
private fun LanguageStepBody(state: RegistrationUiState, viewModel: RegistrationViewModel) {
    var activeSlot by remember { mutableStateOf(LanguageSlot.SYSTEM) }
    var query by remember { mutableStateOf("") }
    val selection = state.languageSelection
    val filtered = remember(query) { LanguageStepSelection.filter(query) }

    Column(
        modifier = Modifier.padding(top = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            text = stringResource(R.string.registration_language_header),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(
            text = stringResource(R.string.registration_language_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            LanguageSlotCard(
                label = stringResource(R.string.registration_language_system_tab),
                valueLabel = LanguageStepSelection.summaryLabel(selection.systemLanguage),
                color = MeeshyPalette.Indigo500,
                isActive = activeSlot == LanguageSlot.SYSTEM,
                onClick = { activeSlot = LanguageSlot.SYSTEM },
                modifier = Modifier.weight(1f),
            )
            LanguageSlotCard(
                label = stringResource(R.string.registration_language_regional_tab),
                valueLabel = LanguageStepSelection.summaryLabel(selection.regionalLanguage),
                color = MeeshyPalette.Warning,
                isActive = activeSlot == LanguageSlot.REGIONAL,
                onClick = { activeSlot = LanguageSlot.REGIONAL },
                modifier = Modifier.weight(1f),
            )
        }

        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            singleLine = true,
            placeholder = { Text(stringResource(R.string.registration_language_search_hint)) },
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.sm),
        )

        LanguagePickerGrid(
            languages = filtered,
            activeSlot = activeSlot,
            selection = selection,
            onSelect = { code ->
                when (activeSlot) {
                    LanguageSlot.SYSTEM -> viewModel.onSystemLanguageChange(code)
                    LanguageSlot.REGIONAL -> viewModel.onRegionalLanguageChange(code)
                }
            },
        )

        LanguageTranslationPreviewCard(systemLanguage = selection.systemLanguage)
    }
}

@Composable
private fun LanguageSlotCard(
    label: String,
    valueLabel: String,
    color: Color,
    isActive: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(color.copy(alpha = if (isActive) 0.18f else 0.08f))
            .clickable(onClick = onClick)
            .padding(MeeshySpacing.sm)
            .semantics { contentDescription = "$label $valueLabel" },
    ) {
        Text(text = label, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textSecondary)
        Text(
            text = valueLabel,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
    }
}

@Composable
private fun LanguagePickerGrid(
    languages: List<LanguageInfo>,
    activeSlot: LanguageSlot,
    selection: LanguageSelectionState,
    onSelect: (String) -> Unit,
) {
    val activeColor = if (activeSlot == LanguageSlot.SYSTEM) MeeshyPalette.Indigo500 else MeeshyPalette.Warning
    Column(
        modifier = Modifier.padding(top = MeeshySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        languages.chunked(2).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                row.forEach { language ->
                    LanguageCard(
                        language = language,
                        isSelected = LanguageStepSelection.isSelected(activeSlot, language.code, selection),
                        activeColor = activeColor,
                        onClick = { onSelect(language.code) },
                        modifier = Modifier.weight(1f),
                    )
                }
                if (row.size == 1) Box(modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun LanguageCard(
    language: LanguageInfo,
    isSelected: Boolean,
    activeColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val rowLabel = "${language.nativeName} ${language.code.uppercase()}"
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(if (isSelected) activeColor.copy(alpha = 0.15f) else MeeshyTheme.tokens.backgroundSecondary)
            .clickable(onClick = onClick)
            .padding(MeeshySpacing.sm)
            .semantics { contentDescription = rowLabel },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Text(text = language.flag, style = MaterialTheme.typography.titleMedium)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = language.nativeName,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = language.code.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        if (isSelected) {
            Icon(
                imageVector = Icons.Filled.CheckCircle,
                contentDescription = null,
                tint = activeColor,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
private fun LanguageTranslationPreviewCard(systemLanguage: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.sm)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Text(
            text = stringResource(R.string.registration_language_example_title),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textSecondary,
        )
        Text(
            text = LanguageStepSelection.translationPreview(systemLanguage),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
        )
    }
}

/**
 * RECAP step — parity target: iOS `StepRecapView`
 * (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`): a summary card of
 * every field collected so far, a terms-acceptance checkbox with a "read the terms" sheet, and
 * the primary button (already wired by [RegistrationBottomBar] to
 * [RegistrationViewModel.register] via [RegistrationNavModel.primaryAction]). Every decision is
 * driven by already-shipped pure cores — [RegistrationUiState.summary] (`RegistrationSummary`,
 * slice `registration-recap-summary`) for the rows and
 * [me.meeshy.sdk.model.auth.RegistrationStepGate]'s RECAP arm
 * (`fields.acceptTerms`, slice `registration-step-gate-core`) for the proceed gate — this
 * Composable only renders the summary + binds the checkbox to
 * [RegistrationViewModel.onAcceptTermsChange]. No skip affordance
 * ([RegistrationNavModel.showSkip] is PROFILE-only, matches iOS having none for this step
 * either); loading/error states are already rendered once, above every step body (the shared
 * `state.errorMessage` banner in [RegistrationScreen]), so this body doesn't duplicate them the
 * way iOS's `StepRecapView` does internally.
 *
 * **Deliberately no password row**, unlike iOS's recap (which appends a `••••••••` row built
 * from `password.count` outside `summaryItems`): [RegistrationSummaryRow]'s
 * [me.meeshy.sdk.model.auth.SummaryField] enum has no `PASSWORD` case — a deliberate call made
 * two slices ago when `RegistrationSummary` shipped (`registration-recap-summary`,
 * 2026-07-26), re-verified here rather than silently overridden. Never re-surfacing the
 * password, even as masked dots whose *length* is itself a (weak) signal, is a legitimate
 * simplification over iOS, not an accidental parity miss.
 */
/**
 * PROFILE step — optional avatar/banner picker + bio, parity target iOS
 * `StepProfileView`. Purely local capture: neither the pick nor the bio edit
 * hits the network here — `POST /auth/register` carries none of these fields
 * (verified against iOS's own `register()`), so [RegistrationViewModel.register]
 * uploads them best-effort once authenticated (kdoc on
 * `RegistrationViewModel.uploadProfileCompletionAssets`). Reuses
 * [RecapSummaryCard] verbatim for the profile preview (iOS reuses the same
 * `summaryItems` for both `StepProfileView` and `StepRecapView` — same
 * information, same card, no near-duplicate string/composable).
 *
 * Deliberate simplification over iOS: the avatar does not overlap the banner
 * (iOS offsets it -30pt over the banner's bottom edge). A plain stacked layout
 * avoids Compose's offset/clip interaction inside a rounded, clipped container
 * for a purely cosmetic flourish with no functional value.
 */
@Composable
private fun ProfileStepBody(state: RegistrationUiState, viewModel: RegistrationViewModel) {
    val context = LocalContext.current
    val avatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { context.contentResolver.readMediaUploadItem(it) }?.let(viewModel::onProfileImagePicked)
    }
    val bannerPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { context.contentResolver.readMediaUploadItem(it) }?.let(viewModel::onBannerImagePicked)
    }
    val imageOnly = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)

    Column(
        modifier = Modifier.padding(top = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = stringResource(R.string.registration_profile_header),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(
            text = stringResource(R.string.registration_profile_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(MeeshyPalette.Warning.copy(alpha = 0.1f))
                .padding(MeeshySpacing.sm),
        ) {
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = MeeshyPalette.Warning,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = stringResource(R.string.registration_profile_optional_note),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }

        ProfilePreviewCard(
            state = state,
            onAvatarClick = { avatarPicker.launch(imageOnly) },
            onBannerClick = { bannerPicker.launch(imageOnly) },
        )

        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Text(
                text = stringResource(R.string.registration_profile_bio_title),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textSecondary,
            )
            OutlinedTextField(
                value = state.fields.bio,
                onValueChange = viewModel::onBioChange,
                enabled = !state.isSubmitting,
                minLines = 3,
                maxLines = 5,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                text = stringResource(R.string.registration_profile_bio_counter, state.fields.bio.length),
                style = MaterialTheme.typography.labelSmall,
                color = if (state.fields.bio.length > PROFILE_BIO_SOFT_LIMIT) {
                    MeeshyTheme.tokens.error
                } else {
                    MeeshyTheme.tokens.textSecondary
                },
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        RecapSummaryCard(rows = state.summary)
    }
}

/** Matches iOS `onboarding.step.profile.bio.counter`'s hardcoded "/150" ceiling — display-only, never blocks typing. */
private const val PROFILE_BIO_SOFT_LIMIT = 150

@Composable
private fun ProfilePreviewCard(
    state: RegistrationUiState,
    onAvatarClick: () -> Unit,
    onBannerClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyTheme.tokens.backgroundSecondary),
    ) {
        Box(modifier = Modifier.fillMaxWidth().height(100.dp)) {
            val banner = state.bannerImage
            if (banner != null) {
                AsyncImage(
                    model = banner.bytes,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.linearGradient(
                                listOf(
                                    MeeshyPalette.Indigo500.copy(alpha = 0.3f),
                                    MeeshyPalette.Indigo500.copy(alpha = 0.1f),
                                ),
                            ),
                        ),
                )
            }
            ProfileCameraBadge(
                onClick = onBannerClick,
                contentDescription = stringResource(R.string.registration_profile_banner_a11y),
                background = Color.Black.copy(alpha = 0.5f),
                size = 32.dp,
                iconSize = 16.dp,
                modifier = Modifier.align(Alignment.BottomEnd).padding(MeeshySpacing.xs),
            )
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            modifier = Modifier.padding(MeeshySpacing.md),
        ) {
            Box {
                val avatar = state.profileImage
                if (avatar != null) {
                    AsyncImage(
                        model = avatar.bytes,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(64.dp).clip(CircleShape),
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(64.dp)
                            .clip(CircleShape)
                            .background(MeeshyPalette.Indigo500.copy(alpha = 0.2f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Person,
                            contentDescription = null,
                            tint = MeeshyPalette.Indigo500.copy(alpha = 0.5f),
                            modifier = Modifier.size(28.dp),
                        )
                    }
                }
                ProfileCameraBadge(
                    onClick = onAvatarClick,
                    contentDescription = stringResource(R.string.registration_profile_photo_a11y),
                    background = MeeshyPalette.Indigo500,
                    size = 24.dp,
                    iconSize = 12.dp,
                    modifier = Modifier.align(Alignment.BottomEnd),
                )
            }
            Column {
                val fullName = "${state.fields.firstName} ${state.fields.lastName}".trim()
                if (fullName.isNotEmpty()) {
                    Text(
                        text = fullName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MeeshyTheme.tokens.textPrimary,
                    )
                }
                if (state.fields.username.isNotEmpty()) {
                    Text(
                        text = "@${state.fields.username}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
            }
        }
    }
}

@Composable
private fun ProfileCameraBadge(
    onClick: () -> Unit,
    contentDescription: String,
    background: Color,
    size: Dp,
    iconSize: Dp,
    modifier: Modifier = Modifier,
) {
    IconButton(
        onClick = onClick,
        modifier = modifier.size(size).clip(CircleShape).background(background),
    ) {
        Icon(
            imageVector = Icons.Filled.PhotoCamera,
            contentDescription = contentDescription,
            tint = Color.White,
            modifier = Modifier.size(iconSize),
        )
    }
}

private fun ContentResolver.readMediaUploadItem(uri: Uri): MediaUploadItem? {
    val bytes = runCatching { openInputStream(uri)?.use { it.readBytes() } }.getOrNull() ?: return null
    val mimeType = getType(uri).orEmpty()
    val fileName = profileMediaDisplayName(uri).orEmpty()
    return MediaUploadItem(bytes = bytes, fileName = fileName, mimeType = mimeType)
}

private fun ContentResolver.profileMediaDisplayName(uri: Uri): String? =
    runCatching {
        query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        }
    }.getOrNull()

@Composable
private fun RecapStepBody(state: RegistrationUiState, viewModel: RegistrationViewModel) {
    var showTerms by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.padding(top = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            text = stringResource(R.string.registration_recap_header),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(
            text = stringResource(R.string.registration_recap_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        RecapSummaryCard(rows = state.summary, modifier = Modifier.padding(top = MeeshySpacing.md))
        RecapTermsCheckbox(
            accepted = state.fields.acceptTerms,
            enabled = !state.isSubmitting,
            onToggle = { viewModel.onAcceptTermsChange(!state.fields.acceptTerms) },
            onReadTerms = { showTerms = true },
            modifier = Modifier.padding(top = MeeshySpacing.sm),
        )
    }

    if (showTerms) {
        RecapTermsSheet(onDismiss = { showTerms = false })
    }
}

@Composable
private fun RecapSummaryCard(rows: List<RegistrationSummaryRow>, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Icon(
                imageVector = Icons.Filled.Description,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = stringResource(R.string.registration_recap_summary_title),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        rows.forEach { row -> RecapSummaryRow(row) }
    }
}

@Composable
private fun RecapSummaryRow(row: RegistrationSummaryRow) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(
            imageVector = row.field.icon(),
            contentDescription = null,
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(20.dp),
        )
        Text(
            text = stringResource(row.field.labelRes()),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = row.value,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
        )
    }
}

/** Faithful port of iOS `summaryItems`'s per-field SF Symbol (`at`/`envelope.fill`/`person.fill`/`phone.fill`/`globe`). */
private fun SummaryField.icon(): ImageVector = when (this) {
    SummaryField.USERNAME -> Icons.Filled.AlternateEmail
    SummaryField.EMAIL -> Icons.Filled.Email
    SummaryField.NAME -> Icons.Filled.Person
    SummaryField.PHONE -> Icons.Filled.Phone
    SummaryField.LANGUAGES -> Icons.Filled.Language
    SummaryField.BIO -> Icons.Filled.Description
}

private fun SummaryField.labelRes(): Int = when (this) {
    SummaryField.USERNAME -> R.string.registration_recap_field_username
    SummaryField.EMAIL -> R.string.registration_recap_field_email
    SummaryField.NAME -> R.string.registration_recap_field_name
    SummaryField.PHONE -> R.string.registration_recap_field_phone
    SummaryField.LANGUAGES -> R.string.registration_recap_field_languages
    SummaryField.BIO -> R.string.registration_recap_field_bio
}

@Composable
private fun RecapTermsCheckbox(
    accepted: Boolean,
    enabled: Boolean,
    onToggle: () -> Unit,
    onReadTerms: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val acceptLabel = stringResource(R.string.registration_recap_terms_accept)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .toggleable(
                value = accepted,
                enabled = enabled,
                role = Role.Checkbox,
                onValueChange = { onToggle() },
            )
            .padding(MeeshySpacing.md)
            .semantics { contentDescription = acceptLabel },
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Box(
            modifier = Modifier
                .size(24.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(if (accepted) MeeshyPalette.Success else Color.Transparent)
                .border(2.dp, if (accepted) MeeshyPalette.Success else MeeshyTheme.tokens.inputBorder, RoundedCornerShape(6.dp)),
        ) {
            if (accepted) {
                Icon(
                    imageVector = Icons.Filled.Check,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(16.dp).align(Alignment.Center),
                )
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Text(
                text = acceptLabel,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = stringResource(R.string.registration_recap_terms_read),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Medium,
                color = MeeshyPalette.Indigo500,
                modifier = Modifier.clickable(enabled = enabled, onClick = onReadTerms),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RecapTermsSheet(onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = MeeshyTheme.tokens.backgroundPrimary) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 520.dp)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
        ) {
            Text(
                text = stringResource(R.string.registration_recap_terms_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = stringResource(R.string.registration_recap_terms_body),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.padding(top = MeeshySpacing.md, bottom = MeeshySpacing.lg),
            )
            TextButton(onClick = onDismiss, modifier = Modifier.align(Alignment.End)) {
                Text(stringResource(R.string.registration_close))
            }
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
