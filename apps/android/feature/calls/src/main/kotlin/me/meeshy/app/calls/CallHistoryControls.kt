package me.meeshy.app.calls

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import me.meeshy.feature.calls.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Le champ « Rechercher un appel » (iOS `ContactsSearchField`) : filtre à chaque frappe, croix pour effacer. */
@Composable
internal fun CallHistorySearchField(query: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    val clear = stringResource(R.string.call_journal_close)
    OutlinedTextField(
        value = query,
        onValueChange = onChange,
        modifier = modifier.fillMaxWidth().heightIn(min = 48.dp),
        singleLine = true,
        shape = RoundedCornerShape(MeeshyRadius.lg),
        placeholder = { Text(stringResource(R.string.call_journal_search_placeholder)) },
        leadingIcon = { Icon(MeeshyIcons.Search, contentDescription = null, tint = MeeshyTheme.tokens.textMuted) },
        trailingIcon = {
            AnimatedVisibility(visible = query.isNotEmpty(), enter = fadeIn(), exit = fadeOut()) {
                IconButton(onClick = { onChange("") }) {
                    Icon(
                        MeeshyIcons.Close,
                        contentDescription = clear,
                        tint = MeeshyTheme.tokens.textMuted,
                    )
                }
            }
        },
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, imeAction = ImeAction.Search),
        keyboardActions = KeyboardActions(onSearch = { }),
    )
}

/** « Tous · Manqués · Vidéo » et, à droite, « Tout effacer » tant que le journal a des lignes. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CallHistoryFilterRow(
    missedOnly: Boolean,
    videoOnly: Boolean,
    canClear: Boolean,
    onMissed: (Boolean) -> Unit,
    onVideo: (Boolean) -> Unit,
    onClearAll: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = LocalHapticFeedback.current
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.smPlus),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier.weight(1f).horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FilterChip(
                selected = !missedOnly,
                onClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    onMissed(false)
                },
                label = { Text(stringResource(R.string.call_history_filter_all)) },
            )
            FilterChip(
                selected = missedOnly,
                onClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    onMissed(true)
                },
                label = { Text(stringResource(R.string.call_history_filter_missed)) },
            )
            FilterChip(
                selected = videoOnly,
                onClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    onVideo(!videoOnly)
                },
                label = { Text(stringResource(R.string.call_journal_filter_video)) },
            )
        }
        Crossfade(targetState = canClear, label = "calls-clear-all") { shown ->
            if (shown) {
                // Marges réduites : sur un écran étroit (360 dp) les trois puces tiennent entières à gauche du bouton (#13379).
                TextButton(onClick = onClearAll, contentPadding = PaddingValues(horizontal = MeeshySpacing.sm)) {
                    Text(
                        text = stringResource(R.string.call_journal_clear_all),
                        color = MeeshyPalette.Error,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        softWrap = false,
                    )
                }
            }
        }
    }
}

/** La bannière « L'effacement a échoué. Réessayez. » : se plie quand elle est fermée. */
@Composable
internal fun CallHistoryEraseFailedBanner(visible: Boolean, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn() + expandVertically(),
        exit = fadeOut() + shrinkVertically(),
        modifier = modifier,
    ) {
        val close = stringResource(R.string.call_journal_close)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.xsPlus)
                .background(MeeshyPalette.Error.copy(alpha = 0.12f), RoundedCornerShape(MeeshyRadius.md))
                .padding(start = MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(MeeshyIcons.WarningFilled, contentDescription = null, tint = MeeshyPalette.Error)
            Text(
                text = stringResource(R.string.call_journal_erase_failed),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.weight(1f).padding(horizontal = MeeshySpacing.smPlus),
            )
            IconButton(onClick = onDismiss, modifier = Modifier.semantics { contentDescription = close }) {
                Icon(MeeshyIcons.Close, contentDescription = null, tint = MeeshyTheme.tokens.textMuted)
            }
        }
    }
}

/** La confirmation de « Tout effacer » : seul MON journal part, les autres participants gardent le leur. */
@Composable
internal fun CallHistoryClearAllDialog(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.call_journal_clear_title)) },
        text = { Text(stringResource(R.string.call_journal_clear_message)) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(stringResource(R.string.call_journal_clear_action), color = MeeshyPalette.Error)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.call_journal_cancel)) }
        },
    )
}

@Composable
internal fun CallHistorySearchEmpty(query: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            text = stringResource(R.string.call_journal_search_empty, query.trim()),
            style = MaterialTheme.typography.bodyLarge,
            color = MeeshyTheme.tokens.textSecondary,
        )
        Text(
            text = stringResource(R.string.call_journal_search_empty_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textMuted,
        )
    }
}
