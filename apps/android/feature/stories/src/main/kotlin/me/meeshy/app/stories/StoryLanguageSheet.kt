package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.LanguageInfo
import me.meeshy.ui.component.bubble.LanguageExplorerRow
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * L'explorateur de langues d'une story (iOS `StoryLanguageDetailView`), ouvert par le « + » de la
 * barre rapide : le contenu de la langue courante en tête, l'entrée « Original », puis une ligne
 * par langue avec aperçu, « Retraduire » ou « Traduire ». Feuille : croix + glissé vers le bas.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun StoryLanguageSheet(
    explorer: StoryLanguageExplorer,
    onSelectLanguage: (String) -> Unit,
    onTranslate: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(Modifier.padding(horizontal = MeeshySpacing.lg)) {
            Box(Modifier.fillMaxWidth().padding(bottom = MeeshySpacing.sm)) {
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.align(Alignment.CenterStart).size(40.dp).clip(CircleShape)
                        .background(MeeshyTheme.tokens.inputBackground),
                ) {
                    Icon(
                        imageVector = MeeshyIcons.Close,
                        contentDescription = stringResource(R.string.story_language_close),
                        tint = MeeshyTheme.tokens.textSecondary,
                        modifier = Modifier.size(18.dp),
                    )
                }
                Text(
                    text = stringResource(R.string.story_language_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = Modifier.align(Alignment.Center),
                )
            }
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()).padding(bottom = MeeshySpacing.xl),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                explorer.current?.let { CurrentContentCard(it) }
                HorizontalDivider(color = MeeshyTheme.tokens.backgroundTertiary)
                OriginalRow(selected = explorer.originalSelected) {
                    onSelectLanguage(StoryLanguageOverride.ORIGINAL)
                    onDismiss()
                }
                explorer.rows.forEach { row ->
                    LanguageRow(
                        row = row,
                        onPick = {
                            if (row.hasContent) {
                                onSelectLanguage(row.code)
                                onDismiss()
                            } else {
                                onTranslate(row.code)
                            }
                        },
                        onRetranslate = { onTranslate(row.code) },
                    )
                }
            }
        }
    }
}

@Composable
private fun tintOf(info: LanguageInfo?): Color =
    info?.colorHex?.let(::hexColor)?.takeIf { it != Color.Unspecified } ?: MeeshyTheme.tokens.textMuted

@Composable
private fun CurrentContentCard(current: StoryCurrentContent) {
    val tint = tintOf(current.info)
    val name = current.info?.name ?: current.code?.uppercase() ?: stringResource(R.string.story_language_original)
    Column(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(MeeshyRadius.md))
            .background(tint.copy(alpha = 0.08f)).padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Box(Modifier.size(6.dp).clip(CircleShape).background(tint))
            Text(text = name, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = tint, modifier = Modifier.weight(1f))
            current.code?.let {
                Text(
                    text = it.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = tint,
                    modifier = Modifier.clip(CircleShape).background(tint.copy(alpha = 0.16f)).padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
        Text(text = current.text, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
    }
}

@Composable
private fun OriginalRow(selected: Boolean, onClick: () -> Unit) {
    val label = stringResource(R.string.story_language_original)
    val accent = if (selected) MeeshyPalette.Indigo400 else MeeshyTheme.tokens.textMuted
    Row(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(if (selected) accent.copy(alpha = 0.10f) else Color.Transparent)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) { this.selected = selected; role = Role.Button; contentDescription = label }
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(imageVector = MeeshyIcons.Quote, contentDescription = null, tint = accent, modifier = Modifier.size(16.dp))
        Text(text = label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = if (selected) accent else MeeshyTheme.tokens.textPrimary, modifier = Modifier.weight(1f))
        Text(text = stringResource(R.string.story_language_original_hint), style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 150.dp))
        if (selected) Icon(imageVector = MeeshyIcons.CheckCircleFilled, contentDescription = null, tint = accent, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun LanguageRow(row: LanguageExplorerRow, onPick: () -> Unit, onRetranslate: () -> Unit) {
    val tint = tintOf(row.info)
    val name = row.info?.name ?: row.code
    Row(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(if (row.isSelected) tint.copy(alpha = 0.10f) else Color.Transparent)
            .clickable(role = Role.Button, onClick = onPick)
            .semantics(mergeDescendants = false) { this.selected = row.isSelected; contentDescription = name }
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(tint))
        Text(text = row.info?.flag ?: row.code.uppercase(), style = MaterialTheme.typography.bodyLarge)
        Text(text = name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = if (row.isSelected) tint else MeeshyTheme.tokens.textPrimary, modifier = Modifier.weight(1f))
        when {
            row.isTranslating -> CircularProgressIndicator(color = tint, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
            row.hasContent -> {
                row.preview?.let {
                    Text(text = it, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 150.dp))
                }
                IconButton(onClick = onRetranslate, enabled = row.canRetranslate, modifier = Modifier.size(32.dp)) {
                    Icon(imageVector = MeeshyIcons.Refresh, contentDescription = stringResource(R.string.story_language_retranslate), tint = tint.copy(alpha = 0.8f), modifier = Modifier.size(16.dp))
                }
                Icon(
                    imageVector = if (row.isSelected) MeeshyIcons.CheckCircleFilled else MeeshyIcons.ChevronForward,
                    contentDescription = null,
                    tint = if (row.isSelected) tint else MeeshyTheme.tokens.textMuted,
                    modifier = Modifier.size(18.dp),
                )
            }
            else -> Text(
                text = stringResource(R.string.story_language_translate),
                style = MaterialTheme.typography.labelMedium,
                color = tint,
                modifier = Modifier.clip(CircleShape).background(tint.copy(alpha = 0.14f)).padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
            )
        }
    }
}
