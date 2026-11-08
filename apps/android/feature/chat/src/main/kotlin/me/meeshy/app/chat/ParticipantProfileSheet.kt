package me.meeshy.app.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.SelectableDates
import me.meeshy.sdk.model.ParticipantCardPresenter
import me.meeshy.sdk.model.ParticipantInfoKind
import me.meeshy.sdk.model.ParticipantInfoRow
import me.meeshy.ui.theme.MeeshyPalette
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.History
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.people.BlockEntry
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.FeedbackToastHost
import me.meeshy.ui.component.FeedbackToastRequest
import me.meeshy.ui.component.people.BlockConfirmDialog
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.text.DateFormat
import java.time.Instant
import java.util.Date

/**
 * La fiche d'un participant (#3943) — troisième client de ce que iOS
 * (`ParticipantProfileSheet.swift`) et web (`ParticipantProfileCard.tsx`)
 * rendent depuis #3877. Même mot, même icône, même place (dimension 6).
 *
 * Trois sections, dans l'ordre où l'œil les cherche :
 *  1. **qui c'est** — nom, pseudo, arrivée, lien emprunté le cas échéant ;
 *  2. **ce qu'il ne peut pas faire** — les REFUS seulement. Énoncer huit
 *     permissions dont sept accordées noierait la seule information utile ; la
 *     règle vit dans `ParticipantEntryCapabilities.denied` (`core:model`),
 *     partagée avec les deux autres clients ;
 *  3. **l'historique** — l'octroi par DATE, éditable seulement si le serveur
 *     l'annonce (`canGrantHistory`), en lecture seule pour un hôte qui lit sans
 *     pouvoir écrire, muette pour un membre ordinaire.
 *
 * **Rien n'est recalculé ici.** Le gateway sert ce que ce lecteur a le droit de
 * voir et dit s'il a le droit d'écrire ; ce Composable rend un `UiState`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ParticipantProfileSheet(
    conversationId: String,
    participantId: String,
    displayName: String,
    accentColor: Color,
    onDismiss: () -> Unit,
    // Un ViewModel PAR fiche : partagé, il peignait la réponse tardive de A sous B (audit #15733).
    viewModel: ParticipantProfileViewModel = hiltViewModel(key = "participant-profile/$conversationId/$participantId"),
    avatarUrl: String? = null,
    readerRole: String? = null,
    blockViewModel: ParticipantBlockViewModel = hiltViewModel(key = "participant-block/$conversationId/$participantId"),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val blockState by blockViewModel.state.collectAsStateWithLifecycle()
    val blockToasts = remember { MutableSharedFlow<FeedbackToastRequest>(extraBufferCapacity = 2) }
    val haptics = rememberMeeshyHaptics()
    LaunchedEffect(state.profile?.userId, state.profile?.isAnonymous) {
        blockViewModel.bind(state.profile?.userId, state.profile?.isAnonymous == true)
    }
    LaunchedEffect(blockViewModel) {
        blockViewModel.effectFlow.collect { effect ->
            if (effect is ParticipantBlockEffect.Failed) {
                haptics.error()
                blockToasts.tryEmit(
                    FeedbackToastRequest(
                        if (effect.wasBlocking) R.string.participant_block_failed else R.string.participant_unblock_failed,
                        FeedbackKind.Error,
                    ),
                )
            }
        }
    }
    var datePickerOpen by remember { mutableStateOf(false) }

    // Le rôle est une clé : un lecteur rétrogradé pendant que la fiche est ouverte la relit sous son nouveau rôle.
    LaunchedEffect(conversationId, participantId, readerRole) {
        viewModel.load(conversationId, participantId, readerRole)
    }
    DisposableEffect(viewModel) { onDispose { viewModel.close() } }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            val visitor = state.profile?.isAnonymous == true
            val tint = if (visitor) MeeshyPalette.Purple500 else accentColor
            val shownName = state.profile?.let(ParticipantCardPresenter::fullName)?.takeIf { it.isNotBlank() } ?: displayName
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                MeeshyAvatar(
                    name = shownName,
                    size = 56.dp,
                    containerColor = tint,
                    imageUrl = state.profile?.avatar ?: avatarUrl,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = shownName,
                        style = MaterialTheme.typography.titleMedium,
                        color = MeeshyTheme.tokens.textPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    state.profile?.username?.takeIf { it.isNotBlank() }?.let { username ->
                        Text(
                            text = "@$username",
                            style = MaterialTheme.typography.bodySmall,
                            color = MeeshyTheme.tokens.textSecondary,
                        )
                    }
                    if (visitor) {
                        Text(
                            text = stringResource(R.string.participant_profile_no_account),
                            style = MaterialTheme.typography.labelSmall,
                            color = tint,
                            modifier = Modifier
                                .background(tint.copy(alpha = 0.15f), RoundedCornerShape(50))
                                .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xxs),
                        )
                    }
                }
            }

            when (state.status) {
                ProfileLoadStatus.Loading, ProfileLoadStatus.Idle ->
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), color = accentColor)

                ProfileLoadStatus.Left -> Text(
                    text = stringResource(R.string.participant_profile_has_left),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyTheme.tokens.textSecondary,
                )

                ProfileLoadStatus.Error -> {
                    Text(
                        text = stringResource(R.string.participant_profile_unavailable),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                    TextButton(onClick = viewModel::retry) {
                        Text(stringResource(R.string.participant_profile_retry))
                    }
                }

                ProfileLoadStatus.Loaded -> {
                    state.infoRows.forEach { row -> InfoRow(row) }

                    // Les droits ne concernent que les visiteurs sans compte : pour un inscrit, le gateway sert
                    // `null` et la section disparaît.
                    blockState.entry?.let { entry ->
                        ParticipantBlockEntry(entry = entry, name = shownName, onClick = blockViewModel::onEntryTapped)
                    }

                    if (state.profile?.entryCapabilities != null) {
                        ParticipantRightsSection(state = state, onToggle = viewModel::toggleRight)
                    }

                    state.linkSettings?.let { settings ->
                        ParticipantEntryLinkSection(settings, accentColor, ::formatDay)
                    }

                    // Muette pour un membre ordinaire : rien à dire sur un fait de modération qui ne le regarde pas.
                    if (state.canGrantHistory || state.historyVisibleFrom != null) {
                        SectionTitle(stringResource(R.string.participant_profile_history))
                        LabelledRow(
                            icon = Icons.Filled.History,
                            text = state.historyVisibleFrom
                                ?.let { stringResource(R.string.participant_profile_history_since, formatDay(it)) }
                                ?: stringResource(R.string.participant_profile_history_none),
                        )
                        if (state.canGrantHistory) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                            ) {
                                TextButton(
                                    onClick = { datePickerOpen = true },
                                    enabled = !state.grantWriteInFlight,
                                    modifier = Modifier.heightIn(min = 48.dp),
                                ) {
                                    Text(stringResource(R.string.participant_profile_history_set))
                                }
                                if (state.historyVisibleFrom != null) {
                                    TextButton(
                                        onClick = viewModel::clearHistoryGrant,
                                        enabled = !state.grantWriteInFlight,
                                        modifier = Modifier.heightIn(min = 48.dp).widthIn(min = 48.dp),
                                    ) {
                                        Text(stringResource(R.string.participant_profile_history_clear))
                                    }
                                }
                            }
                        }
                        if (state.grantFailed) {
                            Text(
                                text = stringResource(R.string.participant_profile_history_error),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                                // L'échec doit être ANNONCÉ, pas seulement dessiné (#4393).
                                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                            )
                        }
                    }
                }
            }
        }
    }

    if (blockState.confirming) {
        BlockConfirmDialog(
            displayName = state.profile?.let(ParticipantCardPresenter::fullName) ?: displayName,
            fallbackName = stringResource(R.string.participant_block_fallback_name),
            title = stringResource(R.string.participant_block_confirm_title),
            message = { name -> stringResource(R.string.participant_block_confirm_message, name) },
            confirmLabel = stringResource(R.string.participant_block_confirm_action),
            cancelLabel = stringResource(R.string.participant_block_cancel),
            onConfirm = blockViewModel::confirmBlock,
            onDismiss = blockViewModel::dismissConfirmation,
        )
    }
    FeedbackToastHost(toasts = blockToasts)

    if (datePickerOpen) {
        val pickerState = rememberDatePickerState(
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean = utcTimeMillis <= System.currentTimeMillis()
                override fun isSelectableYear(year: Int): Boolean = year <= java.time.Year.now().value
            },
        )
        DatePickerDialog(
            onDismissRequest = { datePickerOpen = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { millis ->
                        viewModel.setHistoryGrant(Instant.ofEpochMilli(millis).toString())
                    }
                    datePickerOpen = false
                }) { Text(stringResource(R.string.participant_profile_history_set)) }
            },
            dismissButton = {
                TextButton(onClick = { datePickerOpen = false }) {
                    Text(stringResource(R.string.conversation_members_retry))
                }
            },
        ) {
            DatePicker(state = pickerState)
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = MeeshyTheme.tokens.textSecondary,
    )
}

@Composable
private fun LabelledRow(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        modifier = Modifier.semantics { contentDescription = text },
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

@Composable
private fun InfoRow(row: ParticipantInfoRow) {
    val label = stringResource(
        when (row.kind) {
            ParticipantInfoKind.LANGUAGE -> R.string.participant_profile_info_language
            ParticipantInfoKind.COUNTRY -> R.string.participant_profile_info_country
            ParticipantInfoKind.JOINED -> R.string.participant_profile_info_joined
            ParticipantInfoKind.VIA_LINK -> R.string.participant_profile_info_via_link
            ParticipantInfoKind.EMAIL -> R.string.participant_profile_info_email
            ParticipantInfoKind.BIRTHDAY -> R.string.participant_profile_info_birthday
        },
    )
    val value = when {
        row.withheld -> stringResource(R.string.participant_profile_withheld)
        row.kind == ParticipantInfoKind.JOINED -> row.value?.let(::formatDayTime).orEmpty()
        else -> row.value.orEmpty()
    }
    Row(
        modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary)
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            color = if (row.withheld) MeeshyTheme.tokens.textMuted else MeeshyTheme.tokens.textPrimary,
        )
    }
}

private fun formatDayTime(iso: String): String = runCatching {
    DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date.from(Instant.parse(iso)))
}.getOrDefault(iso)

/**
 * Une date ISO 8601 rendue dans la locale de l'appareil. Une chaîne du fil qui
 * ne se parse pas est rendue TELLE QUELLE plutôt que remplacée par un vide : un
 * octroi affiché de travers reste un octroi affiché, une case vide dit qu'il
 * n'y en a pas.
 */
private fun formatDay(iso: String): String = runCatching {
    DateFormat.getDateInstance(DateFormat.MEDIUM)
        .format(Date.from(Instant.parse(iso)))
}.getOrDefault(iso)

/** L'entrée rouge « Bloquer » / « Débloquer » de la fiche : cible de 48 dp, libellé TalkBack avec le nom. */
@Composable
private fun ParticipantBlockEntry(entry: BlockEntry, name: String, onClick: () -> Unit) {
    val blocking = entry == BlockEntry.BLOCK
    val label = stringResource(if (blocking) R.string.participant_block_entry else R.string.participant_unblock_entry)
    val description = stringResource(
        if (blocking) R.string.participant_block_entry_a11y else R.string.participant_unblock_entry_a11y,
        name,
    )
    TextButton(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .semantics { contentDescription = description },
    ) {
        Icon(
            imageVector = Icons.Filled.Block,
            contentDescription = null,
            tint = MeeshyTheme.tokens.error,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = label,
            color = MeeshyTheme.tokens.error,
            modifier = Modifier.padding(start = MeeshySpacing.sm),
        )
    }
}
