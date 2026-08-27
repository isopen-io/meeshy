package me.meeshy.app.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.RemoveCircleOutline
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.sdk.model.ParticipantCapability
import java.text.DateFormat
import java.time.Instant
import java.time.ZoneOffset
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
fun ParticipantProfileSheet(
    conversationId: String,
    participantId: String,
    displayName: String,
    accentColor: Color,
    onDismiss: () -> Unit,
    viewModel: ParticipantProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var datePickerOpen by remember { mutableStateOf(false) }

    LaunchedEffect(conversationId, participantId) {
        viewModel.load(conversationId, participantId)
    }

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
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                MeeshyAvatar(name = displayName, size = 56.dp, containerColor = accentColor)
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = state.profile?.displayName ?: displayName,
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
                    state.profile?.joinedAt?.let { joined ->
                        Text(
                            text = stringResource(R.string.participant_profile_joined, formatDay(joined)),
                            style = MaterialTheme.typography.bodySmall,
                            color = MeeshyTheme.tokens.textSecondary,
                        )
                    }
                }
            }

            when (state.status) {
                ProfileLoadStatus.Loading, ProfileLoadStatus.Idle ->
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = accentColor,
                    )

                ProfileLoadStatus.Error -> {
                    Text(
                        text = stringResource(R.string.participant_profile_error),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                    TextButton(onClick = viewModel::retry) {
                        Text(stringResource(R.string.participant_profile_retry))
                    }
                }

                ProfileLoadStatus.Loaded -> {
                    state.profile?.shareLinkName?.takeIf { it.isNotBlank() }?.let { link ->
                        LabelledRow(
                            icon = Icons.Filled.Link,
                            text = stringResource(R.string.participant_profile_via_link, link),
                        )
                    }

                    // Les capacités d'entrée ne concernent QUE les visiteurs sans
                    // compte : pour un inscrit, le gateway sert `null` et la
                    // section disparaît plutôt que d'annoncer « aucune restriction »
                    // à propos d'un régime qui ne s'applique pas à lui.
                    if (state.profile?.entryCapabilities != null) {
                        SectionTitle(stringResource(R.string.participant_profile_capabilities))
                        if (state.deniedCapabilities.isEmpty()) {
                            LabelledRow(
                                icon = Icons.Filled.CheckCircle,
                                text = stringResource(R.string.participant_profile_no_restriction),
                            )
                        } else {
                            state.deniedCapabilities.forEach { capability ->
                                LabelledRow(
                                    icon = Icons.Filled.RemoveCircleOutline,
                                    text = stringResource(deniedLabel(capability)),
                                )
                            }
                        }
                    }

                    // Muette pour un membre ordinaire : `historyVisibleFrom` et
                    // `canGrantHistory` sont alors tous deux nuls/faux, et rien
                    // n'est à dire sur un fait de modération qui ne le regarde pas.
                    if (state.canGrantHistory || state.historyVisibleFrom != null) {
                        SectionTitle(stringResource(R.string.participant_profile_history))
                        LabelledRow(
                            icon = Icons.Filled.History,
                            text = state.historyVisibleFrom
                                ?.let { stringResource(R.string.participant_profile_history_since, formatDay(it)) }
                                ?: stringResource(R.string.participant_profile_history_none),
                        )
                        if (state.canGrantHistory) {
                            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                                TextButton(
                                    onClick = { datePickerOpen = true },
                                    enabled = !state.grantWriteInFlight,
                                ) {
                                    Text(stringResource(R.string.participant_profile_history_set))
                                }
                                if (state.historyVisibleFrom != null) {
                                    TextButton(
                                        onClick = viewModel::clearHistoryGrant,
                                        enabled = !state.grantWriteInFlight,
                                    ) {
                                        Text(stringResource(R.string.participant_profile_history_clear))
                                    }
                                }
                            }
                        }
                        if (state.grantFailed) {
                            Text(
                                text = stringResource(R.string.participant_profile_history_failed),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }
            }
        }
    }

    if (datePickerOpen) {
        val pickerState = rememberDatePickerState()
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

/**
 * Le vocabulaire est ALIGNÉ sur celui des deux autres clients — même phrase,
 * même ordre. Deux formulations concurrentes pour une seule règle se liraient
 * comme deux règles.
 */
private fun deniedLabel(capability: ParticipantCapability): Int = when (capability) {
    ParticipantCapability.CAN_VIEW_HISTORY -> R.string.participant_profile_denied_can_view_history
    ParticipantCapability.CAN_SEND_MESSAGES -> R.string.participant_profile_denied_can_send_messages
    ParticipantCapability.CAN_SEND_IMAGES -> R.string.participant_profile_denied_can_send_images
    ParticipantCapability.CAN_SEND_FILES -> R.string.participant_profile_denied_can_send_files
    ParticipantCapability.CAN_SEND_VIDEOS -> R.string.participant_profile_denied_can_send_videos
    ParticipantCapability.CAN_SEND_AUDIOS -> R.string.participant_profile_denied_can_send_audios
    ParticipantCapability.CAN_SEND_LINKS -> R.string.participant_profile_denied_can_send_links
    ParticipantCapability.CAN_SEND_LOCATIONS -> R.string.participant_profile_denied_can_send_locations
}

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
