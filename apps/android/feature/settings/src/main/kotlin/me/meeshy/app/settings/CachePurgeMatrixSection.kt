package me.meeshy.app.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.mediacache.ByteSizeFormatter
import me.meeshy.sdk.model.mediacache.CacheDataKind
import me.meeshy.sdk.model.mediacache.CacheDomain
import me.meeshy.sdk.model.mediacache.CachePurgeAvailability
import me.meeshy.sdk.model.mediacache.CachePurgeCellId
import me.meeshy.sdk.model.mediacache.CachePurgeLimitation
import me.meeshy.ui.component.MeeshyInfoNote
import me.meeshy.ui.component.MeeshyInfoNoteButton
import me.meeshy.sdk.model.mediacache.CachePurgeReport
import me.meeshy.sdk.model.mediacache.CachePurgeSelection
import me.meeshy.ui.component.settings.SettingsCard
import me.meeshy.ui.component.settings.SettingsSeparator
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Une carte par type de donnée : en-tête cliquable (icône + nom en capitales + taille) puis une ligne par domaine.
 * Les cases non purgeables affichent la RAISON de la limite structurelle, jamais une taille inventée.
 */
@Composable
internal fun CachePurgeKindSection(
    kind: CacheDataKind,
    report: CachePurgeReport,
    selection: CachePurgeSelection,
    onToggleKind: () -> Unit,
    onToggleCell: (CachePurgeCellId) -> Unit,
    noteHost: NoteHost,
) {
    val haptics = rememberMeeshyHaptics()
    val accent = MeeshyPalette.Indigo500
    val kindHint = stringResource(R.string.purge_kind_hint)
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 48.dp)
                .clickable(role = Role.Button, onClickLabel = kindHint) {
                    haptics.light()
                    onToggleKind()
                }
                .padding(start = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        ) {
            Icon(kind.icon(), contentDescription = null, tint = accent, modifier = Modifier.size(14.dp))
            Text(
                text = stringResource(kind.labelRes()).uppercase(),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = accent,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = ByteSizeFormatter.format(report.bytesFor(kind)),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = accent,
            )
        }
        SettingsCard(tint = accent) {
            CacheDomain.entries.forEachIndexed { index, domain ->
                if (index > 0) SettingsSeparator(accent)
                val id = CachePurgeCellId(kind, domain)
                val availability = report.cell(kind, domain)?.availability
                CachePurgeCellRow(
                    domain = domain,
                    availability = availability,
                    selected = selection.isSelected(id),
                    noteHost = noteHost,
                    onToggle = {
                        haptics.light()
                        onToggleCell(id)
                    },
                )
            }
        }
    }
}

@Composable
private fun CachePurgeCellRow(
    domain: CacheDomain,
    availability: CachePurgeAvailability?,
    selected: Boolean,
    noteHost: NoteHost,
    onToggle: () -> Unit,
) {
    val name = stringResource(domain.labelRes())
    when (availability) {
        is CachePurgeAvailability.Purgeable -> {
            val state = stringResource(if (selected) R.string.cache_purge_cell_selected else R.string.cache_purge_cell_unselected)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp)
                    .clickable(role = Role.Checkbox, onClick = onToggle)
                    .semantics(mergeDescendants = true) { stateDescription = state }
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.smPlus),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                Icon(
                    imageVector = if (selected) MeeshyIcons.CheckBoxChecked else MeeshyIcons.CheckBoxBlank,
                    contentDescription = null,
                    tint = if (selected) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textMuted,
                    modifier = Modifier.size(24.dp),
                )
                Text(
                    text = name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = ByteSizeFormatter.format(availability.bytes),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = if (availability.bytes > 0L) MeeshyTheme.tokens.textPrimary else MeeshyTheme.tokens.textMuted,
                )
            }
        }
        is CachePurgeAvailability.Unavailable -> {
            val note = MeeshyInfoNote(
                question = stringResource(R.string.purge_limitation_question, name),
                text = stringResource(availability.limitation.explanationRes()),
            )
            Column {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = MeeshySpacing.lg),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    Icon(
                        imageVector = MeeshyIcons.IndeterminateBox,
                        contentDescription = null,
                        tint = MeeshyTheme.tokens.textMuted,
                        modifier = Modifier.size(24.dp),
                    )
                    Text(
                        text = name,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        color = MeeshyTheme.tokens.textMuted,
                        modifier = Modifier.weight(1f),
                    )
                    MeeshyInfoNoteButton(note = note, expanded = noteHost.isOpen(note), onToggle = { noteHost.toggle(note) })
                }
                if (noteHost.isOpen(note)) {
                    Text(
                        text = note.text,
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textMuted,
                        modifier = Modifier.padding(start = MeeshySpacing.lg, end = MeeshySpacing.lg, bottom = MeeshySpacing.sm),
                    )
                }
            }
        }
        null -> Spacer(Modifier.size(0.dp))
    }
}

internal fun CacheDataKind.labelRes(): Int = when (this) {
    CacheDataKind.IMAGES -> R.string.purge_kind_images
    CacheDataKind.VIDEOS -> R.string.purge_kind_videos
    CacheDataKind.AUDIO -> R.string.purge_kind_audio
    CacheDataKind.DOCUMENTS -> R.string.purge_kind_documents
    CacheDataKind.MESSAGES -> R.string.purge_kind_messages
    CacheDataKind.REACTIONS -> R.string.purge_kind_reactions
    CacheDataKind.PAYLOADS -> R.string.purge_kind_payloads
}

internal fun CacheDataKind.icon() = when (this) {
    CacheDataKind.IMAGES -> MeeshyIcons.PhotoFilled
    CacheDataKind.VIDEOS -> MeeshyIcons.Video
    CacheDataKind.AUDIO -> MeeshyIcons.Waveform
    CacheDataKind.DOCUMENTS -> MeeshyIcons.Document
    CacheDataKind.MESSAGES -> MeeshyIcons.ChatBubble
    CacheDataKind.REACTIONS -> MeeshyIcons.HeartFilled
    CacheDataKind.PAYLOADS -> MeeshyIcons.Storage
}

internal fun CacheDomain.labelRes(): Int = when (this) {
    CacheDomain.POSTS -> R.string.purge_domain_posts
    CacheDomain.REELS -> R.string.purge_domain_reels
    CacheDomain.CONVERSATIONS -> R.string.purge_domain_conversations
    CacheDomain.STORIES -> R.string.purge_domain_stories
}

/** La légende d'une case grisée, telle que la formule iOS. */
internal fun CachePurgeLimitation.explanationRes(): Int = when (this) {
    CachePurgeLimitation.NO_DEDICATED_STORE -> R.string.purge_limitation_no_store
    CachePurgeLimitation.EMBEDDED_IN_PAYLOAD -> R.string.purge_limitation_embedded
    CachePurgeLimitation.INDIVISIBLE_FROM_POSTS -> R.string.purge_limitation_indivisible
    CachePurgeLimitation.NOT_APPLICABLE -> R.string.purge_limitation_not_applicable
}
