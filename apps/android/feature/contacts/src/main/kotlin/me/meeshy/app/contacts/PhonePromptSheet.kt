package me.meeshy.app.contacts

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.background
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.foundation.clickable
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.auth.PhonePlausibility
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val TapTarget = 44.dp
private val FieldHeight = 50.dp

/**
 * Feuille « Ajoute ton numéro » proposée avant la recherche de contacts (#8843), miroir de
 * `PhonePromptSheet.swift`. Le geste hôte décide seul de l'ouvrir, via
 * `PhonePromptPolicy.shouldOffer`. [onContinue] est exécuté à la fermeture dans TOUS les cas
 * (vérifié, « Plus tard », balayage, retour système) : la recherche reprend toujours.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PhonePromptSheet(
    onContinue: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: PhonePromptViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    val scope = rememberCoroutineScope()
    val haptics = rememberMeeshyHaptics()
    val close: () -> Unit = { scope.launch { sheetState.hide() }.invokeOnCompletion { viewModel.onClosed(onContinue) } }

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                PhonePromptEffect.HapticSuccess -> haptics.success()
                PhonePromptEffect.HapticError -> haptics.error()
                PhonePromptEffect.Verified -> close()
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = { viewModel.onClosed(onContinue) },
        sheetState = sheetState,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        modifier = modifier.testTag("phonePromptSheet"),
    ) {
        PhonePromptContent(state, viewModel::onEvent, haptics, onLater = close)
    }
}

@OptIn(ExperimentalComposeUiApi::class)
@Composable
internal fun PhonePromptContent(
    state: PhonePromptUiState,
    onEvent: (PhonePromptEvent) -> Unit,
    haptics: MeeshyHaptics,
    onLater: () -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    val phoneFocus = remember { FocusRequester() }
    val codeFocus = remember { FocusRequester() }
    LaunchedEffect(state.isCodeStep) {
        runCatching { (if (state.isCodeStep) codeFocus else phoneFocus).requestFocus() }
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.xl, vertical = MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        Header()
        if (state.isCodeStep) {
            CodeStep(state, onEvent, haptics, codeFocus)
        } else {
            PhoneStep(state, onEvent, haptics, phoneFocus)
        }
        val message = state.error?.let { errorText(it) }
        if (message != null) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                color = tokens.error,
                textAlign = TextAlign.Center,
            )
        }
        val laterA11y = stringResource(R.string.phone_prompt_later_a11y)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = TapTarget)
                .clickable(role = Role.Button) { haptics.light(); onLater() }
                .clearAndSetSemantics { contentDescription = laterA11y; role = Role.Button }
                .testTag("phonePromptLater"),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = stringResource(R.string.phone_prompt_later),
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                color = tokens.textSecondary,
            )
        }
    }
}

@Composable
private fun Header() {
    val tokens = MeeshyTheme.tokens
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Box(
            modifier = Modifier.size(56.dp).background(MeeshyGradients.brand, RoundedCornerShape(28.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(MeeshyIcons.PersonAdd, contentDescription = null, tint = MeeshyPalette.White)
        }
        Text(
            text = stringResource(R.string.phone_prompt_title),
            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
            color = tokens.textPrimary,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = stringResource(R.string.phone_prompt_benefit),
            style = MaterialTheme.typography.bodyMedium,
            color = tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun PhoneStep(state: PhonePromptUiState, onEvent: (PhonePromptEvent) -> Unit, haptics: MeeshyHaptics, focus: FocusRequester) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md), modifier = Modifier.fillMaxWidth()) {
        PromptField(
            value = state.flow.number,
            onValueChange = { onEvent(PhonePromptEvent.NumberChanged(it)) },
            keyboardType = KeyboardType.Phone,
            placeholder = stringResource(R.string.phone_prompt_placeholder),
            label = stringResource(R.string.phone_prompt_phone_label),
            textStyle = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
            modifier = Modifier.focusRequester(focus).testTag("phonePromptNumber"),
        )
        state.refusal?.let {
            Text(refusalText(it), style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.error)
        }
        PrimaryButton(
            title = stringResource(R.string.phone_prompt_send_code),
            isBusy = state.isSending,
            isEnabled = state.canSend,
            tag = "phonePromptSend",
        ) { haptics.medium(); onEvent(PhonePromptEvent.SendCode) }
    }
}

@Composable
private fun CodeStep(state: PhonePromptUiState, onEvent: (PhonePromptEvent) -> Unit, haptics: MeeshyHaptics, focus: FocusRequester) {
    Column(
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = stringResource(R.string.phone_prompt_code_sent),
            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
            color = MeeshyTheme.tokens.success,
        )
        PromptField(
            value = state.flow.code,
            onValueChange = { onEvent(PhonePromptEvent.CodeChanged(it)) },
            keyboardType = KeyboardType.NumberPassword,
            placeholder = stringResource(R.string.phone_prompt_code_label),
            label = stringResource(R.string.phone_prompt_code_label),
            textStyle = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center),
            modifier = Modifier.focusRequester(focus).testTag("phonePromptCode"),
        )
        PrimaryButton(
            title = stringResource(R.string.phone_prompt_verify),
            isBusy = state.isVerifying,
            isEnabled = state.canVerify,
            tag = "phonePromptVerify",
        ) { haptics.medium(); onEvent(PhonePromptEvent.VerifyCode) }
        Box(
            modifier = Modifier
                .heightIn(min = TapTarget)
                .size(width = 96.dp, height = TapTarget)
                .clickable(role = Role.Button) { haptics.light(); onEvent(PhonePromptEvent.EditNumber) }
                .testTag("phonePromptEdit"),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = stringResource(R.string.phone_prompt_edit),
                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                color = MeeshyPalette.Indigo500,
            )
        }
    }
}

@Composable
private fun PromptField(
    value: String,
    onValueChange: (String) -> Unit,
    keyboardType: KeyboardType,
    placeholder: String,
    label: String,
    textStyle: TextStyle,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    TextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = true,
        textStyle = textStyle.copy(color = tokens.textPrimary),
        placeholder = { Text(placeholder, color = tokens.textMuted, style = textStyle.copy(fontWeight = FontWeight.Normal)) },
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        shape = RoundedCornerShape(14.dp),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = tokens.inputBackground,
            unfocusedContainerColor = tokens.inputBackground,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
        ),
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = FieldHeight)
            .semantics { contentDescription = label },
    )
}

@Composable
private fun PrimaryButton(title: String, isBusy: Boolean, isEnabled: Boolean, tag: String, onClick: () -> Unit) {
    val container = if (isEnabled) MeeshyPalette.Indigo500 else MeeshyPalette.Indigo500.copy(alpha = 0.4f)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = FieldHeight)
            .background(container, RoundedCornerShape(percent = 50))
            .clickable(enabled = isEnabled, role = Role.Button, onClick = onClick)
            .testTag(tag),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (isBusy) {
            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = MeeshyPalette.White, strokeWidth = 2.dp)
            Box(Modifier.size(MeeshySpacing.sm))
        }
        Text(title, color = MeeshyPalette.White, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Bold))
    }
}

@Composable
private fun errorText(error: PhonePromptError): String = stringResource(
    when (error) {
        PhonePromptError.CODE_INVALID -> R.string.phone_prompt_error_code_invalid
        PhonePromptError.SEND_FAILED, PhonePromptError.GENERIC -> R.string.phone_prompt_error_generic
    },
)

@Composable
private fun refusalText(refusal: PhonePlausibility.Refusal): String = when (refusal) {
    PhonePlausibility.Refusal.TOO_SHORT -> stringResource(R.string.phone_prompt_too_short, PhonePlausibility.MIN_DIGITS)
    PhonePlausibility.Refusal.IDENTICAL_RUN,
    PhonePlausibility.Refusal.REPEATED_PATTERN,
    -> stringResource(R.string.phone_prompt_implausible)
}
