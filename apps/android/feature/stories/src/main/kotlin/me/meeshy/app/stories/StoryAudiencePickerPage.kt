package me.meeshy.app.stories

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.AudienceCandidate
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Le sélecteur de personnes (`ONLY` / `EXCEPT` / mention) — une PAGE de la feuille d'audience,
 * pas une seconde feuille. Annuler / OK dans l'en-tête ; les contacts du cache paraissent à
 * l'ouverture, la saisie filtre le local puis complète par l'annuaire. [single] (mention) valide
 * dès le premier choix.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun StoryAudiencePickerPage(
    title: String,
    initialSelection: List<String>,
    single: Boolean,
    keepsBlocked: Boolean = false,
    onCancel: () -> Unit,
    onDone: (ids: List<String>, people: List<AudienceCandidate>) -> Unit,
    viewModel: StoryAudiencePickerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(initialSelection, keepsBlocked) { viewModel.start(initialSelection, keepsBlocked) }
    val haptics = LocalHapticFeedback.current

    Column(modifier = Modifier.fillMaxWidth().navigationBarsPadding()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onCancel) { Text(stringResource(R.string.stories_audience_picker_cancel)) }
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                modifier = Modifier.weight(1f),
            )
            if (!single) {
                TextButton(onClick = { onDone(state.selectedIds, state.selected) }) {
                    Text(stringResource(R.string.stories_audience_picker_done), fontWeight = FontWeight.SemiBold)
                }
            }
        }
        OutlinedTextField(
            value = state.query,
            onValueChange = viewModel::onQueryChange,
            singleLine = true,
            leadingIcon = { Icon(MeeshyIcons.Search, contentDescription = null) },
            trailingIcon = {
                if (state.isSearching) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            },
            placeholder = { Text(stringResource(R.string.audience_picker_search)) },
            modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg),
        )
        if (!single && state.selected.isNotEmpty()) {
            LazyRow(
                modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.sm),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = MeeshySpacing.lg),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                items(state.selected, key = { it.id }) { person ->
                    AssistChip(onClick = { viewModel.onToggle(person.id) }, label = { Text(person.label) })
                }
            }
        }
        Box(modifier = Modifier.fillMaxWidth().heightIn(min = 240.dp, max = 460.dp)) {
            if (state.results.isEmpty() && state.hasLoadedContacts && !state.isSearching) {
                Text(
                    text = stringResource(R.string.stories_audience_pick_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.Center),
                )
            } else {
                LazyColumn(modifier = Modifier.fillMaxWidth()) {
                    items(state.results, key = { it.id }) { person ->
                        val checked = person.id in state.selectedIds
                        PersonRow(person, checked, single) {
                            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            if (single) onDone(listOf(person.id), listOf(person)) else viewModel.onToggle(person.id)
                        }
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun PersonRow(person: AudienceCandidate, checked: Boolean, single: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clickable(onClick = onClick)
            .padding(horizontal = MeeshySpacing.lg)
            .semantics(mergeDescendants = true) {
                role = if (single) Role.Button else Role.Checkbox
                selected = checked
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(name = person.label, size = 40.dp, imageUrl = person.avatar)
        Column(modifier = Modifier.weight(1f)) {
            Text(person.label, style = MaterialTheme.typography.bodyLarge, maxLines = 1)
            Text(
                "@${person.username}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
        if (!single) {
            Icon(
                imageVector = if (checked) MeeshyIcons.CheckCircleFilled else MeeshyIcons.RadioUnchecked,
                contentDescription = null,
                tint = if (checked) MeeshyPalette.Indigo500 else MaterialTheme.colorScheme.outline,
            )
        }
    }
}
