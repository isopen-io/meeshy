package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.bubble.LanguageExplorerRow
import me.meeshy.ui.component.bubble.MessageLanguageExplorer
import me.meeshy.ui.component.bubble.RowFailure
import me.meeshy.ui.component.bubble.SelectedTranslation
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * The per-message language explorer (Prisme Linguistique — exhaustive view). Lists
 * the original-language banner plus every explorable target language projected by
 * [MessageDetailExplorer]: tap a language to switch the bubble to it, tap the
 * refresh icon to retranslate an existing one, or tap a content-less language to
 * translate it on demand.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MessageLanguageExplorerSheet(
    explorer: MessageLanguageExplorer,
    accentColor: Color,
    onSelectLanguage: (String) -> Unit,
    onRetranslate: (String) -> Unit,
    onDismiss: () -> Unit,
    /** Ouvre la feuille « Traduire l'audio » ; nul pour un message sans vocal ouvert (jamais un vocal protégé). */
    onTranslateAudio: (() -> Unit)? = null,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Text(
                text = stringResource(R.string.chat_explorer_title),
                style = MaterialTheme.typography.titleMedium,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.padding(vertical = MeeshySpacing.sm),
            )

            val originalColor = explorer.originalInfo?.colorHex
                ?.let(::hexColor)
                ?.takeIf { it != Color.Unspecified }
                ?: accentColor
            OriginalBanner(explorer = explorer, color = originalColor)

            explorer.selected?.let { selected ->
                SelectedTranslationCard(
                    selected = selected,
                    fallbackColor = accentColor,
                    onClose = { onSelectLanguage(selected.code) },
                )
            }

            HorizontalDivider(color = MeeshyTheme.tokens.backgroundTertiary)

            onTranslateAudio?.let { open ->
                Button(onClick = open, modifier = Modifier.fillMaxWidth()) {
                    Text(text = stringResource(R.string.audio_fullscreen_language_choose))
                }
            }

            explorer.rows.forEach { row ->
                LanguageExplorerRowView(
                    row = row,
                    accentColor = accentColor,
                    onSelect = { onSelectLanguage(row.code) },
                    onRetranslate = { onRetranslate(row.code) },
                )
                row.failure?.let { failure ->
                    Text(
                        text = stringResource(
                            if (failure == RowFailure.SERVER_REFUSED) {
                                R.string.message_translation_e2ee_serverRefused
                            } else {
                                R.string.chat_explorer_request_failed
                            },
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textMuted,
                        modifier = Modifier.padding(horizontal = MeeshySpacing.sm),
                    )
                }
            }
        }
    }
}

@Composable
private fun OriginalBanner(explorer: MessageLanguageExplorer, color: Color) {
    val name = explorer.originalInfo?.name ?: (explorer.originalCode ?: "").uppercase()
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(color.copy(alpha = 0.08f))
                .padding(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(color))
            Icon(
                imageVector = MeeshyIcons.TextBubble,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(14.dp),
            )
            Text(
                text = stringResource(R.string.chat_explorer_original_banner, name),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.weight(1f),
            )
            explorer.originalCode?.let { code ->
                Text(
                    text = code.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = color,
                    modifier = Modifier
                        .clip(RoundedCornerShape(MeeshyRadius.sm))
                        .background(color.copy(alpha = 0.12f))
                        .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
                )
            }
        }
        if (explorer.originalPreview.isNotEmpty()) {
            Row(
                modifier = Modifier.padding(horizontal = MeeshySpacing.xs),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                if (explorer.originalIsTranscription) {
                    Icon(
                        imageVector = MeeshyIcons.Waveform,
                        contentDescription = null,
                        tint = color.copy(alpha = 0.7f),
                        modifier = Modifier.size(14.dp),
                    )
                }
                Text(
                    text = explorer.originalPreview,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 3,
                )
            }
        }
    }
}

@Composable
private fun SelectedTranslationCard(selected: SelectedTranslation, fallbackColor: Color, onClose: () -> Unit) {
    val color = selected.info?.colorHex?.let(::hexColor)?.takeIf { it != Color.Unspecified } ?: fallbackColor
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(color.copy(alpha = 0.08f))
            .padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Box(modifier = Modifier.size(6.dp).clip(CircleShape).background(color))
            Text(
                text = selected.info?.name ?: selected.code.uppercase(),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = color,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onClose, modifier = Modifier.size(48.dp)) {
                Icon(
                    imageVector = MeeshyIcons.Close,
                    contentDescription = stringResource(R.string.chat_explorer_close_translation),
                    tint = MeeshyTheme.tokens.textMuted,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
        Text(
            text = selected.text,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
        )
    }
}

@Composable
private fun LanguageExplorerRowView(
    row: LanguageExplorerRow,
    accentColor: Color,
    onSelect: () -> Unit,
    onRetranslate: () -> Unit,
) {
    val accent = row.info?.colorHex
        ?.let(::hexColor)
        ?.takeIf { it != Color.Unspecified }
        ?: accentColor
    val label = row.info?.name ?: row.code
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(if (row.isSelected) accent.copy(alpha = 0.12f) else Color.Transparent)
            .clickable(enabled = !row.isTranslating, onClick = onSelect)
            .semantics {
                role = Role.Button
                selected = row.isSelected
            }
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(text = row.info?.flag ?: row.code.uppercase(), style = MaterialTheme.typography.labelLarge)
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (row.isSelected) FontWeight.SemiBold else FontWeight.Normal,
            color = if (row.isSelected) accent else MeeshyTheme.tokens.textPrimary,
        )
        Spacer(modifier = Modifier.weight(1f))
        when {
            row.isTranslating -> CircularProgressIndicator(
                color = accent,
                strokeWidth = 2.dp,
                modifier = Modifier.size(18.dp),
            )
            row.hasContent || row.hasAudio -> {
                row.preview?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textMuted,
                        maxLines = 1,
                        modifier = Modifier.widthIn(max = 160.dp),
                    )
                }
                if (row.preview == null && row.hasAudio) {
                    Icon(
                        imageVector = MeeshyIcons.Waveform,
                        contentDescription = null,
                        tint = accent.copy(alpha = 0.7f),
                        modifier = Modifier.size(14.dp),
                    )
                    row.audioPreview?.let {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MeeshyTheme.tokens.textMuted,
                            maxLines = 1,
                            modifier = Modifier.widthIn(max = 140.dp),
                        )
                    }
                }
                if (row.canRetranslate) {
                    IconButton(onClick = onRetranslate, modifier = Modifier.size(28.dp)) {
                        Icon(
                            imageVector = Icons.Filled.Refresh,
                            contentDescription = stringResource(R.string.chat_explorer_retranslate_a11y),
                            tint = accent.copy(alpha = 0.7f),
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
                if (row.isSelected) {
                    Icon(
                        imageVector = Icons.Filled.Check,
                        contentDescription = null,
                        tint = accent,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
            else -> Text(
                text = stringResource(R.string.chat_explorer_translate),
                style = MaterialTheme.typography.labelMedium,
                color = accent,
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .background(accent.copy(alpha = 0.12f))
                    .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
            )
        }
    }
}
