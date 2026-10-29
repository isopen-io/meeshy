package me.meeshy.app.onboarding

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.People
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.text.NumberFormat
import me.meeshy.feature.auth.R
import me.meeshy.app.onboarding.illustrations.OnboardingBellIllustration
import me.meeshy.app.onboarding.illustrations.OnboardingEnvelopeIllustration
import me.meeshy.app.onboarding.illustrations.OnboardingGlobeIllustration
import me.meeshy.app.onboarding.illustrations.OnboardingPrismIllustration
import me.meeshy.app.onboarding.illustrations.OnboardingStoryRingIllustration
import me.meeshy.app.onboarding.illustrations.OnboardingTrophyIllustration
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.onboarding.OnboardingCard
import me.meeshy.sdk.model.onboarding.OnboardingRecap
import me.meeshy.sdk.model.onboarding.OnboardingRewards
import me.meeshy.sdk.model.onboarding.OnboardingSendState
import me.meeshy.sdk.model.onboarding.OnboardingStepId
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

/**
 * Les gestes que les cartes remettent à l'hôte. Les cartes ne décident de rien : ce qu'elles proposent, ce qu'elles ont
 * produit et ce qui vient ensuite sont tranchés par [OnboardingViewModel] (iOS `OnboardingCardView`).
 */
@Immutable
internal data class OnboardingCardActions(
    val later: () -> Unit = {},
    val advance: () -> Unit = {},
    val confirmLanguages: () -> Unit = {},
    val selectPrimaryLanguage: (String) -> Unit = {},
    val toggleSecondaryLanguage: (String) -> Unit = {},
    val resendVerificationLink: () -> Unit = {},
    val editGreeting: (String) -> Unit = {},
    val sendGreeting: () -> Unit = {},
    val openStory: () -> Unit = {},
    val addFriend: (String) -> Unit = {},
    val findFriends: () -> Unit = {},
    val declineContacts: () -> Unit = {},
    val continueFromFriends: () -> Unit = {},
    val openContactsSettings: () -> Unit = {},
    val inviteByText: () -> Unit = {},
    val acceptNotifications: () -> Unit = {},
    val explore: () -> Unit = {},
    val finish: () -> Unit = {},
    val openGame: () -> Unit = {},
    val pickBirthDate: (java.time.LocalDate) -> Unit = {},
    val declareBirthDate: () -> Unit = {},
    val acknowledgeAgeRefusal: () -> Unit = {},
)

/** La carte courante du parcours : un aiguillage, rien d'autre. */
@Composable
internal fun OnboardingCardContent(
    state: OnboardingUiState,
    actions: OnboardingCardActions,
    reduceMotion: Boolean,
) {
    when (val card = state.card) {
        is OnboardingCard.Step -> when (card.id) {
            OnboardingStepId.LANGUAGES -> LanguagesCard(state, actions, reduceMotion)
            OnboardingStepId.AGE -> OnboardingAgeCard(state, actions)
            OnboardingStepId.EMAIL -> EmailCard(state, actions)
            OnboardingStepId.GLOBAL -> GlobalCard(state, actions, reduceMotion)
            OnboardingStepId.STORY -> StoryCard(state, actions, reduceMotion)
            OnboardingStepId.FRIENDS -> OnboardingFriendsCard(state, actions)
            OnboardingStepId.NOTIFICATIONS -> NotificationsCard(actions, reduceMotion)
        }
        OnboardingCard.Recap -> RecapCard(state, actions, reduceMotion)
        null -> Unit
    }
}

internal fun onboardingLater(actions: OnboardingCardActions, title: String) =
    OnboardingAction(title = title, tag = "onboarding.later", perform = actions.later)

@Composable
internal fun laterAction(actions: OnboardingCardActions) =
    onboardingLater(actions, stringResource(R.string.onboarding_later))

@Composable
internal fun continueAction(onClick: () -> Unit) =
    OnboardingAction(title = stringResource(R.string.onboarding_card_continue), tag = "onboarding.continue", perform = onClick)

// region 1 — langues

@Composable
private fun LanguagesCard(state: OnboardingUiState, actions: OnboardingCardActions, reduceMotion: Boolean) {
    OnboardingCardLayout(
        title = stringResource(R.string.onboarding_languages_title),
        message = stringResource(R.string.onboarding_languages_body),
        primary = OnboardingAction(
            title = stringResource(R.string.onboarding_languages_confirm),
            tag = "onboarding.languages.confirm",
            perform = actions.confirmLanguages,
        ),
        secondary = laterAction(actions),
        illustration = { OnboardingPrismIllustration(reduceMotion = reduceMotion) },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
            OnboardingLevelGauge(points = state.sessionPoints, threshold = OnboardingRewards.firstLevel)
            PrimaryLanguagePicker(state.primaryLanguage, actions.selectPrimaryLanguage)
            SecondaryLanguageChips(state, actions.toggleSecondaryLanguage)
        }
    }
}

@Composable
private fun PrimaryLanguagePicker(selected: String, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val name = LanguageData.autonym(selected)
    val flag = LanguageData.info(selected)?.flag.orEmpty()
    val description = stringResource(R.string.onboarding_languages_primary_a11y, name)
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionLabel(stringResource(R.string.onboarding_languages_primary))
        Box {
            Row(
                modifier = Modifier
                    .testTag("onboarding.languages.primary")
                    .fillMaxWidth()
                    .heightIn(min = 54.dp)
                    .clickableField { open = true }
                    .semantics(mergeDescendants = true) {
                        role = Role.DropdownList
                        contentDescription = description
                    }
                    .padding(horizontal = MeeshySpacing.lg),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                Text(text = flag, style = meeshyText(MeeshyFontSize.title))
                Text(
                    text = name,
                    modifier = Modifier.weight(1f),
                    color = MeeshyTheme.tokens.textPrimary,
                    style = meeshyText(MeeshyFontSize.headline, FontWeight.SemiBold, rounded = true),
                )
                Text(
                    text = stringResource(R.string.onboarding_languages_change),
                    color = MeeshyPalette.Indigo500,
                    style = meeshyText(MeeshyFontSize.subhead, FontWeight.SemiBold),
                )
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                LanguageData.allLanguagesCommonFirst.forEach { language ->
                    DropdownMenuItem(
                        text = { Text("${language.flag}  ${language.nativeName}") },
                        onClick = {
                            open = false
                            onSelect(language.code)
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun SecondaryLanguageChips(state: OnboardingUiState, onToggle: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionLabel(stringResource(R.string.onboarding_languages_secondary))
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            LanguageData.commonLanguageCodes.filter { it != state.primaryLanguage }.forEach { code ->
                OnboardingChip(
                    title = "${LanguageData.info(code)?.flag.orEmpty()} ${LanguageData.autonym(code)}",
                    isSelected = state.secondaryLanguage == code,
                    onClick = { onToggle(code) },
                )
            }
        }
    }
}

// endregion

// region Valide ton adresse

@Composable
private fun EmailCard(state: OnboardingUiState, actions: OnboardingCardActions) {
    OnboardingCardLayout(
        title = stringResource(R.string.onboarding_email_title),
        message = stringResource(R.string.onboarding_email_body),
        primary = resendLink(state, actions),
        secondary = laterAction(actions),
        illustration = { OnboardingEnvelopeIllustration() },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            state.accountEmail?.let { address ->
                IconLine(Icons.Filled.Email, stringResource(R.string.onboarding_email_address, address))
            }
            VerificationStatus(state)
        }
    }
}

@Composable
internal fun resendLink(state: OnboardingUiState, actions: OnboardingCardActions) = OnboardingAction(
    title = stringResource(R.string.onboarding_email_resend),
    tag = "onboarding.email.resend",
    isBusy = state.verificationLinkState == OnboardingSendState.SENDING,
    perform = actions.resendVerificationLink,
)

@Composable
internal fun VerificationStatus(state: OnboardingUiState) {
    val tokens = MeeshyTheme.tokens
    when (state.verificationLinkState) {
        OnboardingSendState.SENT ->
            IconLine(Icons.Filled.CheckCircle, stringResource(R.string.onboarding_email_sent), tokens.success)
        OnboardingSendState.FAILED -> Text(
            text = stringResource(R.string.onboarding_email_failed),
            color = tokens.errorInk,
            style = meeshyText(MeeshyFontSize.subhead, FontWeight.Medium),
        )
        else -> IconLine(
            Icons.Filled.HourglassEmpty,
            stringResource(R.string.onboarding_email_waiting),
            tokens.textMuted,
            MeeshyFontSize.footnote,
        )
    }
}

// endregion

// region 2 — salut dans Meeshy Global

@Composable
private fun GlobalCard(state: OnboardingUiState, actions: OnboardingCardActions, reduceMotion: Boolean) {
    val sent = state.greetingState == OnboardingSendState.SENT
    val failed = state.greetingState == OnboardingSendState.FAILED
    OnboardingCardLayout(
        title = stringResource(R.string.onboarding_global_title),
        message = stringResource(R.string.onboarding_global_body),
        primary = if (sent) {
            continueAction(actions.advance)
        } else {
            OnboardingAction(
                title = stringResource(if (failed) R.string.onboarding_global_retry else R.string.onboarding_global_send),
                tag = "onboarding.global.send",
                isEnabled = state.greetingDraft.isNotBlank(),
                isBusy = state.greetingState == OnboardingSendState.SENDING,
                perform = actions.sendGreeting,
            )
        },
        secondary = if (sent) null else laterAction(actions),
        illustration = { OnboardingGlobeIllustration(reduceMotion = reduceMotion) },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            if (sent) {
                OutcomeBanner(
                    text = stringResource(R.string.onboarding_global_sent),
                    reward = state.greetingReward?.let { pluralStringResource(R.plurals.onboarding_global_reward, it, it) },
                )
            } else {
                GreetingEditor(state.greetingDraft, actions.editGreeting)
                if (failed) {
                    Text(
                        text = stringResource(R.string.onboarding_global_failed),
                        color = MeeshyTheme.tokens.errorInk,
                        style = meeshyText(MeeshyFontSize.subhead, FontWeight.Medium),
                    )
                }
            }
            OnboardingLevelGauge(points = state.sessionPoints, threshold = OnboardingRewards.firstLevel)
        }
    }
}

@Composable
private fun GreetingEditor(draft: String, onEdit: (String) -> Unit) {
    val description = stringResource(R.string.onboarding_global_editor_a11y)
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Box(Modifier.fillMaxWidth().fieldSurface().padding(MeeshySpacing.md)) {
            BasicTextField(
                value = draft,
                onValueChange = onEdit,
                modifier = Modifier
                    .testTag("onboarding.global.editor")
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .semantics { contentDescription = description },
                textStyle = meeshyText(MeeshyFontSize.body).copy(color = MeeshyTheme.tokens.textPrimary),
                cursorBrush = SolidColor(MeeshyPalette.Indigo500),
                minLines = 2,
                maxLines = 5,
                keyboardOptions = KeyboardOptions.Default,
                decorationBox = { inner ->
                    if (draft.isEmpty()) {
                        Text(
                            text = stringResource(R.string.onboarding_global_placeholder),
                            color = MeeshyTheme.tokens.textMuted,
                            style = meeshyText(MeeshyFontSize.body),
                        )
                    }
                    inner()
                },
            )
        }
        Text(
            text = stringResource(R.string.onboarding_global_hint),
            color = MeeshyTheme.tokens.textMuted,
            style = meeshyText(MeeshyFontSize.footnote, FontWeight.Medium),
        )
    }
}

// endregion

// region 3 — première story

@Composable
private fun StoryCard(state: OnboardingUiState, actions: OnboardingCardActions, reduceMotion: Boolean) {
    val awaitsVerification = state.storyNeedsEmailVerification && state.storyState == OnboardingStoryState.IDLE
    val published = state.storyState == OnboardingStoryState.PUBLISHED
    OnboardingCardLayout(
        title = stringResource(R.string.onboarding_story_title),
        message = stringResource(R.string.onboarding_story_body),
        primary = when {
            awaitsVerification -> resendLink(state, actions)
            published -> continueAction(actions.advance)
            else -> OnboardingAction(
                title = stringResource(R.string.onboarding_story_create),
                tag = "onboarding.story.create",
                perform = actions.openStory,
            )
        },
        secondary = if (published) null else laterAction(actions),
        illustration = { OnboardingStoryRingIllustration(name = state.userDisplayName, reduceMotion = reduceMotion) },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            when {
                awaitsVerification -> {
                    StatusBanner(
                        text = stringResource(R.string.onboarding_story_verify),
                        detail = stringResource(R.string.onboarding_story_verify_detail),
                    )
                    VerificationStatus(state)
                }
                published -> OutcomeBanner(
                    text = stringResource(R.string.onboarding_story_published),
                    reward = state.storyReward?.let { pluralStringResource(R.plurals.onboarding_story_reward, it, it) },
                )
                else -> {
                    val friendsOnly = state.storyVisibility == me.meeshy.sdk.model.onboarding.OnboardingStoryVisibility.FRIENDS
                    IconLine(
                        icon = if (friendsOnly) Icons.Filled.People else Icons.Filled.Public,
                        text = stringResource(
                            if (friendsOnly) R.string.onboarding_story_audience_friends else R.string.onboarding_story_audience_public,
                        ),
                    )
                }
            }
            OnboardingLevelGauge(points = state.sessionPoints, threshold = OnboardingRewards.firstLevel)
        }
    }
}

// endregion

// region 5 — notifications

@Composable
private fun NotificationsCard(actions: OnboardingCardActions, reduceMotion: Boolean) {
    OnboardingCardLayout(
        title = stringResource(R.string.onboarding_notifications_title),
        message = stringResource(R.string.onboarding_notifications_body),
        primary = OnboardingAction(
            title = stringResource(R.string.onboarding_notifications_yes),
            tag = "onboarding.notifications.yes",
            perform = actions.acceptNotifications,
        ),
        secondary = OnboardingAction(
            title = stringResource(R.string.onboarding_notifications_no),
            tag = "onboarding.notifications.no",
            perform = actions.later,
        ),
        illustration = { OnboardingBellIllustration(reduceMotion = reduceMotion) },
    )
}

// endregion

// region Récapitulatif

@Composable
private fun RecapCard(state: OnboardingUiState, actions: OnboardingCardActions, reduceMotion: Boolean) {
    val recap = state.recap
    val message = when {
        recap == null || recap.points <= 0 -> stringResource(R.string.onboarding_recap_empty)
        (recap.streakDays ?: 0) > 0 -> stringResource(R.string.onboarding_recap_tomorrow, (recap.streakDays ?: 0) + 1)
        else -> stringResource(R.string.onboarding_recap_body)
    }
    OnboardingCardLayout(
        title = stringResource(R.string.onboarding_recap_title),
        message = message,
        primary = OnboardingAction(
            title = stringResource(R.string.onboarding_recap_explore),
            tag = "onboarding.recap.explore",
            perform = actions.explore,
        ),
        secondary = OnboardingAction(
            title = stringResource(R.string.onboarding_recap_done),
            tag = "onboarding.recap.done",
            perform = actions.finish,
        ),
        illustration = { OnboardingTrophyIllustration(reduceMotion = reduceMotion) },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            if (recap != null) RecapStats(recap) else CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
            Box(
                modifier = Modifier
                    .testTag("onboarding.recap.game")
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .clickable(role = Role.Button, onClick = actions.openGame),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(R.string.onboarding_recap_game),
                    color = MeeshyPalette.Indigo500,
                    style = meeshyText(MeeshyFontSize.body, FontWeight.SemiBold, rounded = true),
                )
            }
        }
    }
}

@Composable
private fun RecapStats(recap: OnboardingRecap) {
    val format = remember { NumberFormat.getIntegerInstance() }
    val tiles = listOfNotNull(
        stringResource(R.string.onboarding_recap_points) to recap.points,
        stringResource(R.string.onboarding_recap_level) to recap.level,
        recap.streakDays?.let { stringResource(R.string.onboarding_recap_streak) to it },
        recap.badges?.let { stringResource(R.string.onboarding_recap_badges) to it },
    )
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        tiles.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                row.forEach { (label, value) ->
                    val shown = format.format(value)
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 96.dp)
                            .fieldSurface()
                            .padding(vertical = MeeshySpacing.sm)
                            .semantics(mergeDescendants = true) { contentDescription = "$label $shown" },
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text(
                            text = shown,
                            color = MeeshyTheme.tokens.textPrimary,
                            style = meeshyText(MeeshyFontSize.title, FontWeight.ExtraBold, rounded = true),
                        )
                        Text(
                            text = label,
                            color = MeeshyTheme.tokens.textMuted,
                            style = meeshyText(MeeshyFontSize.footnote, FontWeight.SemiBold),
                        )
                    }
                }
                if (row.size == 1) Box(Modifier.weight(1f))
            }
        }
    }
}

// endregion

// region Pièces communes

@Composable
internal fun SectionLabel(text: String) = Text(
    text = text,
    color = MeeshyTheme.tokens.textMuted,
    style = meeshyText(MeeshyFontSize.subhead, FontWeight.SemiBold),
)

@Composable
internal fun IconLine(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    text: String,
    tint: Color = MeeshyTheme.tokens.textSecondary,
    size: androidx.compose.ui.unit.TextUnit = MeeshyFontSize.subhead,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        Text(text = text, color = tint, style = meeshyText(size, FontWeight.Medium))
    }
}

@Composable
internal fun Modifier.fieldSurface(): Modifier {
    val isDark = MeeshyTheme.isDark
    val shape = RoundedCornerShape(16.dp)
    val fill = if (isDark) MeeshyPalette.White.copy(alpha = 0.08f) else MeeshyPalette.Indigo50
    return this
        .background(fill, shape)
        .border(BorderStroke(1.dp, MeeshyPalette.Indigo200.copy(alpha = if (isDark) 0.25f else 0.6f)), shape)
}

@Composable
internal fun Modifier.clickableField(onClick: () -> Unit): Modifier =
    fieldSurface().clickable(role = Role.Button, onClick = onClick)

/** Un état EN COURS ou À REPRENDRE : même gabarit que la réussite, sans coche ni « +N » — rien n'est encore gagné. */
@Composable
internal fun StatusBanner(text: String, detail: String) {
    val tint = MeeshyPalette.Indigo500
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(tint.copy(alpha = 0.12f), RoundedCornerShape(16.dp))
            .padding(MeeshySpacing.md)
            .semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        Text(text, color = MeeshyTheme.tokens.textPrimary, style = meeshyText(MeeshyFontSize.body, FontWeight.SemiBold))
        Text(detail, color = MeeshyTheme.tokens.textSecondary, style = meeshyText(MeeshyFontSize.footnote, FontWeight.Medium))
    }
}

/** [reward] absent tant que le crédit n'est pas relu : jamais un chiffre à corriger une seconde plus tard. */
@Composable
internal fun OutcomeBanner(text: String, reward: String?) {
    val success = MeeshyTheme.tokens.success
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(success.copy(alpha = 0.14f), RoundedCornerShape(16.dp))
            .padding(MeeshySpacing.md)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = success, modifier = Modifier.size(28.dp))
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Text(text, color = MeeshyTheme.tokens.textPrimary, style = meeshyText(MeeshyFontSize.body, FontWeight.SemiBold))
            if (reward != null) {
                Text(
                    reward,
                    color = if (MeeshyTheme.isDark) MeeshyPalette.Indigo300 else MeeshyPalette.Indigo600,
                    style = meeshyText(MeeshyFontSize.subhead, FontWeight.Bold, rounded = true),
                )
            }
        }
    }
}

// endregion
