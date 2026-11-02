package me.meeshy.app.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import me.meeshy.app.onboarding.illustrations.OnboardingFriendsIllustration
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.onboarding.OnboardingAgeState
import me.meeshy.sdk.model.onboarding.OnboardingContactsPhase
import me.meeshy.sdk.model.onboarding.OnboardingRewards
import me.meeshy.sdk.model.onboarding.OnboardingSuggestion
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

private const val SUGGESTIONS_SHOWN = 3

// region Carte âge

/** La date de naissance : le sélecteur n'est ouvert que sur geste, « Confirmer » n'existe qu'une date choisie. */
@Composable
internal fun OnboardingAgeCard(state: OnboardingUiState, actions: OnboardingCardActions) {
    if (state.ageState == OnboardingAgeState.REFUSED) {
        OnboardingCardLayout(
            title = stringResource(R.string.onboarding_age_refused_title),
            message = stringResource(R.string.onboarding_age_refused_body),
            primary = OnboardingAction(
                title = stringResource(R.string.onboarding_age_refused_signOut),
                tag = "onboarding.age.refused.ok",
                perform = actions.acknowledgeAgeRefusal,
            ),
        )
        return
    }
    OnboardingCardLayout(
        title = stringResource(R.string.onboarding_age_title),
        message = stringResource(R.string.onboarding_age_body),
        primary = OnboardingAction(
            title = stringResource(R.string.onboarding_age_confirm),
            tag = "onboarding.age.confirm",
            isEnabled = state.ageDatePicked,
            isBusy = state.ageState == OnboardingAgeState.SENDING,
            perform = actions.declareBirthDate,
        ),
        secondary = OnboardingAction(
            title = stringResource(R.string.onboarding_age_skip),
            tag = "onboarding.later",
            perform = actions.later,
        ),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            BirthDateField(state, actions.pickBirthDate)
            val problem = when (state.ageState) {
                OnboardingAgeState.INVALID -> R.string.onboarding_age_invalid
                OnboardingAgeState.FAILED -> R.string.onboarding_age_failed
                else -> null
            }
            if (problem != null) {
                Text(
                    text = stringResource(problem),
                    color = MeeshyTheme.tokens.errorInk,
                    style = meeshyText(MeeshyFontSize.subhead, FontWeight.Medium),
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BirthDateField(state: OnboardingUiState, onPick: (LocalDate) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val label = stringResource(R.string.onboarding_age_picker)
    val shown = DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).format(state.ageBirthDate)
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionLabel(label)
        Row(
            modifier = Modifier
                .testTag("onboarding.age.picker")
                .fillMaxWidth()
                .heightIn(min = 54.dp)
                .clickableField { open = true }
                .semantics(mergeDescendants = true) { contentDescription = "$label, $shown" }
                .padding(horizontal = MeeshySpacing.lg),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Text(
                text = shown,
                color = if (state.ageDatePicked) MeeshyTheme.tokens.textPrimary else MeeshyTheme.tokens.textMuted,
                style = meeshyText(MeeshyFontSize.headline, FontWeight.SemiBold, rounded = true),
            )
        }
        Text(
            text = stringResource(R.string.onboarding_age_picker_hint),
            color = MeeshyTheme.tokens.textMuted,
            style = meeshyText(MeeshyFontSize.footnote, FontWeight.Medium),
        )
    }
    if (open) {
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = state.ageBirthDate.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        open = false
                        pickerState.selectedDateMillis?.let { millis ->
                            onPick(Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate())
                        }
                    },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) { Text(stringResource(R.string.onboarding_card_continue)) }
            },
        ) { DatePicker(state = pickerState) }
    }
}

// endregion

// region Carte « trouve ta bande »

/**
 * Les amis du carnet d'abord, puis les suggestions du serveur. Tant qu'aucune demande n'est partie, la seule sortie
 * réelle est « Plus tard », et c'est elle qui tient la place principale — jamais un « Continuer » inerte.
 */
@Composable
internal fun OnboardingFriendsCard(state: OnboardingUiState, actions: OnboardingCardActions) {
    val phase = state.contactsPhase
    val offering = phase == OnboardingContactsPhase.Offer
    val rows = state.friendRows
    var expanded by remember { mutableStateOf(false) }
    val shown = if (expanded) rows else rows.take(SUGGESTIONS_SHOWN)
    val reward = OnboardingRewards.friendship
    val hasRequests = state.requestedProfileIds.isNotEmpty()
    val later = OnboardingAction(stringResource(R.string.onboarding_later), "onboarding.later", perform = actions.later)

    OnboardingCardLayout(
        title = friendsTitle(phase),
        message = friendsMessage(phase, reward),
        primary = when {
            offering -> OnboardingAction(
                title = stringResource(R.string.onboarding_contacts_offer_find),
                tag = "onboarding.contacts.find",
                perform = actions.findFriends,
            )
            hasRequests -> continueAction(actions.continueFromFriends)
            else -> later
        },
        secondary = when {
            offering -> OnboardingAction(stringResource(R.string.onboarding_later), "onboarding.contacts.later", perform = actions.declineContacts)
            else -> null
        },
        illustration = {
            OnboardingFriendsIllustration(names = rows.take(3).map { it.displayName }, rewardPoints = reward)
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            FriendsPhaseNotice(phase, actions)
            shown.forEach { suggestion ->
                SuggestionRow(
                    suggestion = suggestion,
                    isRequested = suggestion.id in state.requestedProfileIds,
                    didFail = state.failedProfileId == suggestion.id,
                    onAdd = { actions.addFriend(suggestion.id) },
                )
            }
            if (!expanded && rows.size > SUGGESTIONS_SHOWN) {
                Box(
                    modifier = Modifier
                        .testTag("onboarding.friends.more")
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .clickable(role = Role.Button) { expanded = true },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = stringResource(R.string.onboarding_friends_more),
                        color = MeeshyPalette.Indigo500,
                        style = meeshyText(MeeshyFontSize.subhead, FontWeight.SemiBold, rounded = true),
                    )
                }
            }
            if (hasRequests) {
                Text(
                    text = stringResource(R.string.onboarding_friends_pending, reward),
                    color = MeeshyTheme.tokens.textSecondary,
                    style = meeshyText(MeeshyFontSize.footnote, FontWeight.Medium),
                )
            }
        }
    }
}

@Composable
private fun friendsTitle(phase: OnboardingContactsPhase): String = when {
    phase == OnboardingContactsPhase.Offer -> stringResource(R.string.onboarding_contacts_offer_title)
    phase is OnboardingContactsPhase.Found && phase.friends.isEmpty() -> stringResource(R.string.onboarding_contacts_none_title)
    phase is OnboardingContactsPhase.Found -> stringResource(R.string.onboarding_contacts_found_title)
    else -> stringResource(R.string.onboarding_friends_title)
}

@Composable
private fun friendsMessage(phase: OnboardingContactsPhase, reward: Int): String = when {
    phase == OnboardingContactsPhase.Offer -> stringResource(R.string.onboarding_contacts_offer_body)
    phase is OnboardingContactsPhase.Found && phase.friends.isEmpty() -> stringResource(R.string.onboarding_contacts_none_body)
    phase is OnboardingContactsPhase.Found -> stringResource(R.string.onboarding_contacts_found_body)
    else -> stringResource(R.string.onboarding_friends_body, reward)
}

@Composable
private fun FriendsPhaseNotice(phase: OnboardingContactsPhase, actions: OnboardingCardActions) {
    when {
        phase == OnboardingContactsPhase.Offer -> Text(
            text = stringResource(R.string.onboarding_contacts_offer_promise),
            color = MeeshyTheme.tokens.textMuted,
            style = meeshyText(MeeshyFontSize.footnote, FontWeight.Medium),
        )
        phase == OnboardingContactsPhase.Searching -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        phase == OnboardingContactsPhase.Failed -> TextAction(
            text = stringResource(R.string.onboarding_contacts_failed),
            tag = "onboarding.contacts.retry",
            onClick = actions.findFriends,
        )
        phase == OnboardingContactsPhase.DeniedBySystem -> TextAction(
            text = stringResource(R.string.onboarding_contacts_settings),
            tag = "onboarding.contacts.settings",
            onClick = actions.openContactsSettings,
        )
        phase is OnboardingContactsPhase.Found && phase.friends.isEmpty() -> TextAction(
            text = stringResource(R.string.onboarding_contacts_invite),
            tag = "onboarding.contacts.invite",
            onClick = actions.inviteByText,
        )
    }
}

@Composable
private fun TextAction(text: String, tag: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .testTag(tag)
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = MeeshyPalette.Indigo500,
            style = meeshyText(MeeshyFontSize.subhead, FontWeight.SemiBold, rounded = true),
        )
    }
}

/** Une suggestion de profil. « Envoyée » reste pleinement lisible : le geste y est seulement sans effet. */
@Composable
private fun SuggestionRow(
    suggestion: OnboardingSuggestion,
    isRequested: Boolean,
    didFail: Boolean,
    onAdd: () -> Unit,
) {
    val isDark = MeeshyTheme.isDark
    val spoken = suggestion.languages.map(String::trim).filter(String::isNotEmpty).map(LanguageData::autonym)
    val summary = if (spoken.isEmpty()) {
        if (suggestion.username.isEmpty()) suggestion.displayName else "${suggestion.displayName}, @${suggestion.username}"
    } else {
        stringResource(R.string.onboarding_friends_row_a11y, suggestion.displayName, spoken.joinToString(", "))
    }
    val actionLabel = stringResource(
        if (isRequested) R.string.onboarding_friends_added_a11y else R.string.onboarding_friends_add_a11y,
        suggestion.displayName,
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                if (isDark) MeeshyPalette.White.copy(alpha = 0.06f) else MeeshyPalette.White.copy(alpha = 0.8f),
                RoundedCornerShape(20.dp),
            )
            .padding(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(name = suggestion.displayName, size = 44.dp, imageUrl = suggestion.avatarUrl)
        Column(
            modifier = Modifier.weight(1f).semantics(mergeDescendants = true) { contentDescription = summary },
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        ) {
            Text(
                text = suggestion.displayName,
                maxLines = 1,
                color = MeeshyTheme.tokens.textPrimary,
                style = meeshyText(MeeshyFontSize.body, FontWeight.SemiBold),
            )
            Text(
                text = "@${suggestion.username} " + suggestion.languages.mapNotNull { LanguageData.info(it)?.flag }.joinToString(" "),
                maxLines = 1,
                color = if (didFail) MeeshyTheme.tokens.errorInk else MeeshyTheme.tokens.textMuted,
                style = meeshyText(MeeshyFontSize.footnote),
            )
            if (didFail) {
                Text(
                    text = stringResource(R.string.onboarding_friends_failed),
                    color = MeeshyTheme.tokens.errorInk,
                    style = meeshyText(MeeshyFontSize.footnote, FontWeight.Medium),
                )
            }
        }
        val success = MeeshyTheme.tokens.success
        Box(
            modifier = Modifier
                .testTag("onboarding.friends.add.${suggestion.id}")
                .heightIn(min = 48.dp)
                .background(
                    brush = if (isRequested) androidx.compose.ui.graphics.SolidColor(success.copy(alpha = if (isDark) 0.22f else 0.16f)) else MeeshyGradients.brand,
                    shape = CircleShape,
                )
                .clickable(role = Role.Button, onClickLabel = actionLabel) { if (!isRequested) onAdd() }
                .semantics { contentDescription = actionLabel }
                .padding(horizontal = MeeshySpacing.md),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = stringResource(if (isRequested) R.string.onboarding_friends_added else R.string.onboarding_friends_add),
                color = if (isRequested) MeeshyTheme.tokens.textPrimary else MeeshyPalette.White,
                style = meeshyText(MeeshyFontSize.subhead, FontWeight.SemiBold, rounded = true),
            )
        }
    }
}

// endregion
