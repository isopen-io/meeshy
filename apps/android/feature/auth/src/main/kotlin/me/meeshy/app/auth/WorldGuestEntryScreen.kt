package me.meeshy.app.auth

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.onboarding.rememberOnboardingReduceMotion
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.world.WorldEntryFailure
import me.meeshy.sdk.model.world.WorldGuestEntryRules
import me.meeshy.sdk.model.world.WorldGuestLanguage
import me.meeshy.sdk.model.world.WorldGuestStep
import me.meeshy.ui.component.auth.AuthActionButton
import me.meeshy.ui.component.auth.AuthContentType
import me.meeshy.ui.component.auth.AuthTextField
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.formColumnWidth

private const val STEP_SLIDE_MS = 320
private const val STEP_FADE_MS = 200

/**
 * L'entrée SANS COMPTE dans World Wide (iOS `WorldGuestEntryView`, planche « Onboarding ») :
 * « Comment doit-on vous appeler ? » → « Bonjour …, vous lirez tout en… » → le fil. La troisième étape
 * EST la conversation : l'hôte la monte dès que [onEntered] est appelé.
 *
 * Les deux étapes glissent l'une sur l'autre (sous « Réduire les animations » : fondu seul, ou rien) ;
 * l'erreur d'entrée entre et sort en fondu déplié, secoue le téléphone et est annoncée par TalkBack ;
 * les pastilles de progression disent « Étape x sur 3 » ; le retour système remonte d'une étape avant de
 * fermer l'écran ; le clavier valide le nom par « OK ».
 */
@Composable
fun WorldGuestEntryScreen(
    onEntered: (conversationId: String) -> Unit,
    onJoinWithAccount: (linkKey: String) -> Unit,
    onClose: () -> Unit,
    viewModel: WorldGuestEntryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    val reduceMotion = rememberOnboardingReduceMotion()

    LaunchedEffect(state.destination) {
        when (val destination = state.destination) {
            is WorldDestination.Conversation -> {
                haptics.success()
                onEntered(destination.conversationId)
            }
            is WorldDestination.AccountJoin -> onJoinWithAccount(destination.linkKey)
            null -> Unit
        }
    }
    LaunchedEffect(state.failure) {
        if (state.failure != null) haptics.error()
    }

    val goBack = { if (!viewModel.back()) onClose() }
    BackHandler(onBack = goBack)

    MeeshyBackground {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .imePadding()
                .formColumnWidth(),
        ) {
            TopBar(
                step = state.step,
                backLabel = stringResource(
                    if (state.step == WorldGuestStep.LANGUAGE) R.string.world_entry_back else R.string.world_entry_close,
                ),
                onBack = {
                    haptics.light()
                    goBack()
                },
            )
            when (state.availability) {
                WorldAvailability.Unavailable -> UnavailableState(onClose)
                WorldAvailability.Checking -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MeeshyPalette.Indigo400)
                }
                is WorldAvailability.Open -> AnimatedContent(
                    targetState = state.step,
                    transitionSpec = { stepTransition(initial = initialState, target = targetState, reduceMotion = reduceMotion) },
                    label = "worldGuestStep",
                    modifier = Modifier.fillMaxSize(),
                ) { step ->
                    when (step) {
                        WorldGuestStep.NAME -> NameStep(
                            title = state.worldTitle,
                            name = state.name,
                            canContinue = state.canContinue,
                            onNameChange = viewModel::onNameChange,
                            onContinue = {
                                haptics.light()
                                viewModel.continueToLanguage()
                            },
                        )
                        WorldGuestStep.LANGUAGE -> LanguageStep(
                            name = state.trimmedName,
                            worldTitle = state.worldTitle,
                            selected = state.language,
                            failure = state.failure,
                            canEnter = state.canEnter,
                            isEntering = state.isEntering,
                            onSelect = {
                                haptics.light()
                                viewModel.onLanguageChange(it)
                            },
                            onEnter = viewModel::enter,
                        )
                    }
                }
            }
        }
    }
}

private fun stepTransition(initial: WorldGuestStep, target: WorldGuestStep, reduceMotion: Boolean): ContentTransform {
    if (reduceMotion) return fadeIn(tween(STEP_FADE_MS)) togetherWith fadeOut(tween(STEP_FADE_MS))
    val forward = target.ordinal > initial.ordinal
    val sign = if (forward) 1 else -1
    return (slideInHorizontally(tween(STEP_SLIDE_MS)) { it * sign } + fadeIn(tween(STEP_SLIDE_MS))) togetherWith
        (slideOutHorizontally(tween(STEP_SLIDE_MS)) { -it * sign } + fadeOut(tween(STEP_FADE_MS)))
}

@Composable
private fun TopBar(step: WorldGuestStep, backLabel: String, onBack: () -> Unit) {
    val stepDescription = stringResource(R.string.world_entry_step, step.ordinal + 1, WorldGuestEntryRules.STEP_COUNT)
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
            Icon(MeeshyIcons.Back, contentDescription = backLabel, tint = MeeshyPalette.Indigo500)
        }
        Spacer(Modifier.weight(1f))
        Row(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            modifier = Modifier.clearAndSetSemantics { contentDescription = stepDescription },
        ) {
            repeat(WorldGuestEntryRules.STEP_COUNT) { index ->
                val lit = index <= step.ordinal
                val color by animateColorAsState(
                    targetValue = if (lit) MeeshyPalette.Indigo500 else MeeshyPalette.Indigo300.copy(alpha = 0.25f),
                    animationSpec = tween(STEP_FADE_MS),
                    label = "worldStepDot$index",
                )
                Box(Modifier.width(24.dp).height(4.dp).clip(CircleShape).background(color))
            }
        }
        Spacer(Modifier.weight(1f))
        Spacer(Modifier.size(48.dp))
    }
}

@Composable
private fun NameStep(
    title: String,
    name: String,
    canContinue: Boolean,
    onNameChange: (String) -> Unit,
    onContinue: () -> Unit,
) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        if (name.isEmpty()) runCatching { focus.requestFocus() }
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.xxl, vertical = MeeshySpacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(100.dp)
                .clip(RoundedCornerShape(MeeshyRadius.xxl))
                .background(Brush.linearGradient(MeeshyPalette.BrandGradient)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(MeeshyIcons.Globe, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(48.dp))
        }
        Text(
            text = title,
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyPalette.Indigo500,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = MeeshySpacing.xl).semantics { heading() },
        )
        Text(
            text = stringResource(R.string.world_entry_name_prompt),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = MeeshySpacing.md),
        )
        AuthTextField(
            value = name,
            onValueChange = onNameChange,
            title = stringResource(R.string.world_entry_name_placeholder),
            icon = MeeshyIcons.Person,
            contentType = AuthContentType.PersonName,
            imeAction = ImeAction.Done,
            onImeAction = { if (canContinue) onContinue() },
            modifier = Modifier
                .padding(top = MeeshySpacing.xl)
                .focusRequester(focus),
        )
        Spacer(Modifier.weight(1f).heightIn(min = MeeshySpacing.xl))
        AuthActionButton(
            title = stringResource(R.string.world_entry_continue),
            onClick = onContinue,
            enabled = canContinue,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun LanguageStep(
    name: String,
    worldTitle: String,
    selected: String,
    failure: WorldEntryFailure?,
    canEnter: Boolean,
    isEntering: Boolean,
    onSelect: (String) -> Unit,
    onEnter: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize().padding(horizontal = MeeshySpacing.xxl)) {
        Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            Text(
                text = stringResource(R.string.world_entry_language_greeting, name),
                style = MaterialTheme.typography.displaySmall,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.padding(top = MeeshySpacing.xl).semantics { heading() },
            )
            Text(
                text = stringResource(R.string.world_entry_language_hint),
                style = MaterialTheme.typography.bodyLarge,
                color = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.padding(top = MeeshySpacing.sm),
            )
            val languageGroup = stringResource(R.string.world_entry_language_group)
            Column(
                modifier = Modifier
                    .padding(top = MeeshySpacing.lg)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(MeeshyRadius.lg))
                    .background(MeeshyTheme.tokens.backgroundSecondary)
                    .semantics { contentDescription = languageGroup },
            ) {
                val languages = WorldGuestEntryRules.interfaceLanguages
                languages.forEachIndexed { index, language ->
                    LanguageRow(language, isSelected = language.code == selected, onSelect = { onSelect(language.code) })
                    if (index != languages.lastIndex) HorizontalDivider(color = MeeshyTheme.tokens.textMuted.copy(alpha = 0.2f))
                }
            }
            AuthFailure(failure, modifier = Modifier.padding(top = MeeshySpacing.md))
        }
        AuthActionButton(
            title = stringResource(R.string.world_entry_enter, worldTitle),
            onClick = onEnter,
            enabled = canEnter || isEntering,
            isLoading = isEntering,
            modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xl),
        )
    }
}

@Composable
private fun AuthFailure(failure: WorldEntryFailure?, modifier: Modifier = Modifier) {
    val text = when (failure) {
        null -> null
        WorldEntryFailure.Offline -> stringResource(R.string.world_entry_error_offline)
        WorldEntryFailure.EnterFailed -> stringResource(R.string.world_entry_error_enter)
        is WorldEntryFailure.Refused -> failure.reason
    }
    AuthErrorMessage(text = text, modifier = modifier)
}

@Composable
private fun LanguageRow(language: WorldGuestLanguage, isSelected: Boolean, onSelect: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .background(if (isSelected) MeeshyPalette.Indigo500.copy(alpha = 0.14f) else Color.Transparent)
            .clickable(role = Role.RadioButton, onClick = onSelect)
            .semantics { this.selected = isSelected }
            .padding(horizontal = MeeshySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = language.endonym,
            style = MaterialTheme.typography.titleMedium,
            color = tokens.textPrimary,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = language.code.uppercase(),
            style = MaterialTheme.typography.bodyMedium,
            color = tokens.textMuted,
            modifier = Modifier.clearAndSetSemantics { },
        )
        Icon(
            MeeshyIcons.Check,
            contentDescription = null,
            tint = MeeshyPalette.Indigo500,
            modifier = Modifier.size(20.dp).alpha(if (isSelected) 1f else 0f),
        )
    }
}

@Composable
private fun UnavailableState(onClose: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = MeeshySpacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(MeeshyIcons.Globe, contentDescription = null, tint = MeeshyPalette.Indigo400, modifier = Modifier.size(48.dp))
        Text(
            text = stringResource(R.string.world_entry_unavailable),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = MeeshySpacing.xl),
        )
        TextButton(onClick = onClose, modifier = Modifier.padding(top = MeeshySpacing.md)) {
            Text(stringResource(R.string.world_entry_close), fontWeight = FontWeight.SemiBold, color = MeeshyPalette.Indigo500)
        }
    }
}
