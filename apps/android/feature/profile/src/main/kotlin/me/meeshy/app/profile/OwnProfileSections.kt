package me.meeshy.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.profile.R
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Les destinations que MA page ouvre ; `null` = destination absente, l'entrée ne s'affiche pas. */
internal class OwnProfileDestinations(
    val onOpenStats: (() -> Unit)?,
    val onOpenProgression: (() -> Unit)?,
    val onOpenDecor: (() -> Unit)?,
    val onOpenFriendRequests: () -> Unit,
    val onViewPosts: (userId: String) -> Unit,
)

/**
 * Les sections de MA page dans l'ordre que le présentateur décide (iOS `ProfileView.scrollContent`). Chaque
 * section : en-tête icône + titre colorés par jeton, carte de verre. Sans écran Statistiques, le tableau de
 * bord détaillé reste en ligne sous les cartes, pour ne rien retirer de ce que la page montrait.
 */
@Composable
internal fun OwnProfileSectionsColumn(
    presentation: OwnProfileSectionsPresentation,
    state: OwnProfileUiState,
    destinations: OwnProfileDestinations,
    onPickLanguage: (OwnProfileLanguageSlot) -> Unit,
    onEvent: (OwnProfileUiEvent) -> Unit,
) {
    presentation.sections.forEach { section ->
        when (section) {
            OwnProfileSection.IDENTITY -> OwnProfileIdentitySection(state, onEvent)
            OwnProfileSection.CONTACT -> OwnProfileContactSection(presentation.email, presentation.phone)
            OwnProfileSection.LANGUAGES -> OwnProfileLanguagesSection(presentation.languages, onPickLanguage)
            OwnProfileSection.STATS -> OwnProfileStatsSection(presentation, state, destinations)
            OwnProfileSection.FRIEND_REQUESTS -> OwnProfileFriendRequestsSection(
                badge = presentation.friendRequestsBadge,
                count = state.pendingFriendRequests,
                onOpen = destinations.onOpenFriendRequests,
            )
            OwnProfileSection.MEMBER_SINCE -> OwnProfileMemberSinceSection(presentation.memberSinceEpochMillis)
        }
    }
}

@Composable
private fun OwnProfileSectionBlock(
    icon: ImageVector,
    title: String,
    color: Color,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        Row(
            modifier = Modifier.padding(start = MeeshySpacing.xs).semantics(mergeDescendants = true) {},
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = color, modifier = Modifier.size(14.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.2.sp,
                color = color,
            )
        }
        content()
    }
}

@Composable
private fun OwnProfileCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    MeeshyGlassSurface(modifier = modifier.fillMaxWidth(), shape = RoundedCornerShape(MeeshyRadius.lg)) {
        Column(Modifier.fillMaxWidth(), content = content)
    }
}

@Composable
private fun OwnProfileFieldIcon(icon: ImageVector, tint: Color = MeeshyPalette.Indigo500) {
    Box(
        Modifier
            .size(28.dp)
            .clip(RoundedCornerShape(MeeshyRadius.xs))
            .background(tint.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
    }
}

@Composable
private fun OwnProfileRow(
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 48.dp)
            .padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.smPlus),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        content = content,
    )
}

@Composable
private fun OwnProfileChevron() {
    Icon(
        imageVector = MeeshyIcons.ChevronForward,
        contentDescription = null,
        tint = MeeshyTheme.tokens.textMuted,
        modifier = Modifier.size(18.dp),
    )
}

// MARK: - Identité

@Composable
private fun OwnProfileIdentitySection(state: OwnProfileUiState, onEvent: (OwnProfileUiEvent) -> Unit) {
    val missing = stringResource(R.string.profile_own_value_missing)
    OwnProfileSectionBlock(MeeshyIcons.AccountBoxFilled, stringResource(R.string.profile_section_identity), MeeshyPalette.Indigo500) {
        OwnProfileCard {
            OwnProfileField(MeeshyIcons.PersonFilled, stringResource(R.string.profile_first_name_label), state.firstName, state.isEditing) {
                onEvent(OwnProfileUiEvent.FirstNameChanged(it))
            }
            OwnProfileField(MeeshyIcons.PersonFilled, stringResource(R.string.profile_last_name_label), state.lastName, state.isEditing) {
                onEvent(OwnProfileUiEvent.LastNameChanged(it))
            }
            OwnProfileRow {
                OwnProfileFieldIcon(MeeshyIcons.Mention)
                Text(
                    text = stringResource(R.string.profile_username),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = state.user?.username?.takeIf { it.isNotBlank() }?.let { "@$it" } ?: missing,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyTheme.tokens.textMuted,
                    maxLines = 1,
                )
            }
            OwnProfileField(MeeshyIcons.PersonFilled, stringResource(R.string.profile_display_name_label), state.displayName, state.isEditing) {
                onEvent(OwnProfileUiEvent.DisplayNameChanged(it))
            }
            OwnProfileField(
                icon = MeeshyIcons.Quote,
                title = stringResource(R.string.profile_bio_label),
                value = state.bio,
                isEditing = state.isEditing,
                placeholder = stringResource(R.string.profile_bio_placeholder),
                isMultiline = true,
            ) { onEvent(OwnProfileUiEvent.BioChanged(it)) }
        }
    }
}

/** Un champ d'identité (iOS `profileField`) : titre au-dessus, valeur ou champ de saisie en ligne. */
@Composable
private fun OwnProfileField(
    icon: ImageVector,
    title: String,
    value: String,
    isEditing: Boolean,
    placeholder: String = title,
    isMultiline: Boolean = false,
    onValueChange: (String) -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    val valueStyle = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium, color = tokens.textPrimary)
    OwnProfileRow(Modifier.semantics(mergeDescendants = !isEditing) {}) {
        OwnProfileFieldIcon(icon)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Text(text = title, style = MaterialTheme.typography.labelMedium, color = tokens.textMuted)
            if (isEditing) {
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    textStyle = valueStyle,
                    singleLine = !isMultiline,
                    minLines = if (isMultiline) 3 else 1,
                    maxLines = if (isMultiline) 6 else 1,
                    cursorBrush = SolidColor(MeeshyPalette.Indigo500),
                    modifier = Modifier.fillMaxWidth().semantics { contentDescription = title },
                    decorationBox = { inner ->
                        Box {
                            if (value.isEmpty()) Text(text = placeholder, style = valueStyle.copy(color = tokens.textMuted))
                            inner()
                        }
                    },
                )
            } else {
                Text(
                    text = value.ifEmpty { placeholder },
                    style = valueStyle.copy(color = if (value.isEmpty()) tokens.textMuted else tokens.textPrimary),
                )
            }
        }
    }
}

// MARK: - Contact

@Composable
private fun OwnProfileContactSection(email: OwnProfileContactLine, phone: OwnProfileContactLine) {
    OwnProfileSectionBlock(MeeshyIcons.MailFilled, stringResource(R.string.profile_section_contact), MeeshyPalette.Indigo300) {
        OwnProfileCard {
            OwnProfileContactRow(MeeshyIcons.MailFilled, stringResource(R.string.profile_email), email)
            OwnProfileContactRow(MeeshyIcons.PhoneFilled, stringResource(R.string.profile_phone), phone)
        }
    }
}

@Composable
private fun OwnProfileContactRow(icon: ImageVector, title: String, line: OwnProfileContactLine) {
    val tokens = MeeshyTheme.tokens
    val shown = line.value?.let { value -> line.flag?.let { "$it $value" } ?: value }
        ?: stringResource(R.string.profile_own_value_missing)
    OwnProfileRow(Modifier.semantics(mergeDescendants = true) {}) {
        OwnProfileFieldIcon(icon)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Text(text = title, style = MaterialTheme.typography.labelMedium, color = tokens.textMuted)
            Text(
                text = shown,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = if (line.value != null) tokens.textPrimary else tokens.textMuted,
            )
        }
        line.verification?.let { OwnProfileVerificationBadge(it) }
    }
}

@Composable
private fun OwnProfileVerificationBadge(verification: ContactVerification) {
    val verified = verification == ContactVerification.VERIFIED
    Text(
        text = stringResource(if (verified) R.string.profile_verified else R.string.profile_not_verified),
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyPalette.White,
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(if (verified) MeeshyPalette.Success else MeeshyPalette.Warning)
            .padding(horizontal = MeeshySpacing.xsPlus, vertical = MeeshySpacing.xxs),
    )
}

// MARK: - Langues

@Composable
private fun OwnProfileLanguagesSection(rows: List<OwnProfileLanguageRow>, onPick: (OwnProfileLanguageSlot) -> Unit) {
    OwnProfileSectionBlock(MeeshyIcons.GlobeFilled, stringResource(R.string.profile_section_languages), MeeshyPalette.Error) {
        OwnProfileCard {
            rows.forEach { row -> OwnProfileLanguageRowView(row, onPick) }
        }
    }
}

@Composable
private fun OwnProfileLanguageRowView(row: OwnProfileLanguageRow, onPick: (OwnProfileLanguageSlot) -> Unit) {
    val tokens = MeeshyTheme.tokens
    val tap = if (row.isPickable) Modifier.clickable(role = Role.Button) { onPick(row.slot) } else Modifier
    OwnProfileRow(tap.semantics(mergeDescendants = true) {}) {
        OwnProfileFieldIcon(MeeshyIcons.GlobeFilled)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Text(
                text = stringResource(languageSlotTitle(row.slot)),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = tokens.textPrimary,
            )
            if (row.showsSubtitle) {
                Text(
                    text = stringResource(R.string.profile_language_primary_subtitle),
                    style = MaterialTheme.typography.labelMedium,
                    color = tokens.textMuted,
                )
            }
        }
        when (val value = row.value) {
            is OwnProfileLanguageValue.Chosen -> Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
            ) {
                Text(text = value.flag, style = MaterialTheme.typography.titleMedium)
                Text(
                    text = value.nativeName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = tokens.textMuted,
                )
            }
            OwnProfileLanguageValue.Choose -> OwnProfileMutedValue(stringResource(R.string.profile_language_choose))
            OwnProfileLanguageValue.None -> OwnProfileMutedValue(stringResource(R.string.profile_language_none))
        }
        if (row.isPickable) OwnProfileChevron()
    }
}

@Composable
private fun OwnProfileMutedValue(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        fontWeight = FontWeight.Medium,
        color = MeeshyTheme.tokens.textMuted,
    )
}

internal fun languageSlotTitle(slot: OwnProfileLanguageSlot): Int = when (slot) {
    OwnProfileLanguageSlot.PRIMARY -> R.string.profile_language_primary
    OwnProfileLanguageSlot.REGIONAL -> R.string.profile_language_regional
    OwnProfileLanguageSlot.CUSTOM -> R.string.profile_language_custom
}

// MARK: - Statistiques

@Composable
private fun OwnProfileStatsSection(
    presentation: OwnProfileSectionsPresentation,
    state: OwnProfileUiState,
    destinations: OwnProfileDestinations,
) {
    val title = stringResource(R.string.profile_section_stats)
    OwnProfileSectionBlock(MeeshyIcons.ChartBar, title, MeeshyPalette.Indigo300) {
        OwnProfileStatCardsRow(title, presentation.statCards, destinations.onOpenStats.takeIf { presentation.statsOpenable })
        destinations.onOpenProgression?.takeIf { presentation.showsProgression }?.let { open ->
            OwnProfileEntry(
                icon = MeeshyIcons.Trophy,
                tint = MeeshyPalette.Warning,
                title = stringResource(R.string.profile_progression_title),
                subtitle = stringResource(R.string.profile_progression_subtitle),
                onClick = open,
            )
        }
        destinations.onOpenDecor?.takeIf { presentation.showsDecor }?.let { open ->
            OwnProfileEntry(
                icon = MeeshyIcons.Palette,
                tint = MeeshyPalette.Indigo500,
                title = stringResource(R.string.profile_decor_title),
                subtitle = stringResource(R.string.profile_decor_subtitle),
                onClick = open,
            )
        }
        if (!presentation.statsOpenable) {
            state.stats?.let { ProfileStatsSection(it) }
            state.timeline?.let { ProfileTimelineSection(it) }
        }
        state.user?.id?.takeIf { it.isNotBlank() }?.let { id ->
            ProfilePostsRow(onClick = { destinations.onViewPosts(id) })
        }
    }
}

@Composable
private fun OwnProfileStatCardsRow(sectionTitle: String, cards: OwnProfileStatCards, onOpen: (() -> Unit)?) {
    val messages = stringResource(R.string.profile_stats_messages)
    val conversations = stringResource(R.string.profile_stats_conversations)
    val friends = stringResource(R.string.profile_stats_friends)
    val hint = stringResource(R.string.profile_stats_a11y_hint)
    val summary = "$sectionTitle: ${cards.messages} $messages, ${cards.conversations} $conversations, ${cards.friendRequests} $friends"
    val tap = onOpen?.let { Modifier.clickable(onClickLabel = hint, role = Role.Button, onClick = it) } ?: Modifier
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .then(tap)
            .semantics(mergeDescendants = true) { contentDescription = summary },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        OwnProfileStatCard(cards.messages, messages, MeeshyPalette.Error)
        OwnProfileStatCard(cards.conversations, conversations, MeeshyPalette.Indigo300)
        OwnProfileStatCard(cards.friendRequests, friends, MeeshyPalette.Indigo600)
    }
}

@Composable
private fun RowScope.OwnProfileStatCard(value: String, label: String, color: Color) {
    MeeshyGlassSurface(
        modifier = Modifier.weight(1f),
        shape = RoundedCornerShape(MeeshyRadius.md),
        tint = color.copy(alpha = 0.10f),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        ) {
            Text(text = value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = color)
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = MeeshyTheme.tokens.textMuted,
                maxLines = 1,
            )
        }
    }
}

/** Une entrée vers un autre écran (iOS `ProfileProgressionEntry`, `ProfileDecorEntry`). */
@Composable
private fun OwnProfileEntry(icon: ImageVector, tint: Color, title: String, subtitle: String, onClick: () -> Unit) {
    MeeshyGlassSurface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(MeeshyRadius.md),
        tint = tint.copy(alpha = 0.10f),
    ) {
        OwnProfileRow(Modifier.clickable(role = Role.Button, onClick = onClick).semantics(mergeDescendants = true) {}) {
            OwnProfileFieldIcon(icon, tint)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                )
                Text(text = subtitle, style = MaterialTheme.typography.labelMedium, color = MeeshyTheme.tokens.textMuted)
            }
            OwnProfileChevron()
        }
    }
}

// MARK: - Demandes d'amis

@Composable
private fun OwnProfileFriendRequestsSection(badge: String?, count: Int, onOpen: () -> Unit) {
    val pending = stringResource(R.string.profile_own_friend_requests_pending, count.coerceAtLeast(0))
    OwnProfileSectionBlock(MeeshyIcons.PersonAdd, stringResource(R.string.profile_section_requests), MeeshyPalette.Indigo500) {
        OwnProfileCard {
            OwnProfileRow(
                Modifier
                    .clickable(role = Role.Button, onClick = onOpen)
                    .semantics(mergeDescendants = true) { if (badge != null) stateDescription = pending },
            ) {
                OwnProfileFieldIcon(MeeshyIcons.PeopleFilled)
                Text(
                    text = stringResource(R.string.profile_friend_requests),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = Modifier.weight(1f),
                )
                badge?.let {
                    Box(
                        Modifier
                            .defaultMinSize(minWidth = 22.dp, minHeight = 22.dp)
                            .clip(CircleShape)
                            .background(MeeshyPalette.Indigo500)
                            .padding(horizontal = MeeshySpacing.xs),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(text = it, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = MeeshyPalette.White)
                    }
                }
                OwnProfileChevron()
            }
        }
    }
}

// MARK: - Membre depuis

@Composable
private fun OwnProfileMemberSinceSection(memberSinceEpochMillis: Long?) {
    OwnProfileSectionBlock(MeeshyIcons.CalendarFilled, stringResource(R.string.profile_section_member_since), MeeshyPalette.Indigo600) {
        OwnProfileCard {
            OwnProfileRow {
                Text(
                    text = memberSinceEpochMillis?.let(::formatMemberSince) ?: stringResource(R.string.profile_own_value_missing),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MeeshyTheme.tokens.textPrimary,
                )
                Spacer(Modifier.weight(1f))
            }
        }
    }
}
