package me.meeshy.app.profile

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.ui.component.circles.levelTitle
import me.meeshy.ui.component.circles.tint
import me.meeshy.ui.component.kit.MeeshyLockedRow
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * « Voir comme » (#18887) : ma Vitrine telle que chaque cercle la voit, Public en tête. Ce qui est ouvert au cercle choisi
 * s'écrit en clair ; ce qui est fermé devient une rangée verrouillée (K37) qui nomme le cercle qui l'ouvre, sans jamais porter
 * la donnée protégée. Le contenu vient de [VitrineAsCircle], donc de la loi d'accès partagée.
 */
@Composable
internal fun VitrineAsCircleSheet(onDismiss: () -> Unit) {
    var level by rememberSaveable { mutableStateOf(RelationLevel.PUBLIC) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        VitrineAsCircleContent(level = level, onSelect = { level = it })
    }
}

/** Le contenu de la feuille : le cercle choisi et la Vitrine qu'il voit. L'état vit chez l'hôte, qui le garde à la rotation. */
@Composable
internal fun VitrineAsCircleContent(level: RelationLevel, onSelect: (RelationLevel) -> Unit) {
    val view = remember(level) { VitrineAsCircle.view(level) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 640.dp)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.xl)
            .padding(bottom = MeeshySpacing.xxl),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = stringResource(R.string.vitrine_as_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = stringResource(R.string.vitrine_as_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        Column(modifier = Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            VitrineAsCircle.levels.forEach { candidate ->
                VitrineLevelRow(candidate, selected = candidate == level, onSelect = { onSelect(candidate) })
            }
        }
        VitrineViewBody(view)
    }
}

@Composable
private fun VitrineLevelRow(level: RelationLevel, selected: Boolean, onSelect: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onSelect)
            .padding(horizontal = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = levelTitle(level, null),
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            color = level.tint(),
        )
        RadioButton(selected = selected, onClick = null, modifier = Modifier.clearAndSetSemantics {})
    }
}

@Composable
private fun VitrineViewBody(view: VitrineView) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        if (view.open.isNotEmpty()) {
            SectionTitle(R.string.vitrine_as_open_title)
            view.open.forEach { capability ->
                Text(
                    text = stringResource(capability.title),
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.padding(vertical = MeeshySpacing.xs),
                )
            }
        }
        if (view.locked.isNotEmpty()) {
            SectionTitle(R.string.vitrine_as_hidden_title)
            view.locked.forEach { lock -> VitrineLockedRow(lock) }
        } else {
            Text(
                text = stringResource(R.string.vitrine_as_nothing_hidden),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

@Composable
private fun SectionTitle(@StringRes titleRes: Int) {
    Text(
        text = stringResource(titleRes),
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = Modifier.padding(top = MeeshySpacing.sm).semantics { heading() },
    )
}

/** La rangée du kit (K37) dit elle-même « titre, verrouillé, dès tel cercle » au lecteur d'écran : aucune annonce ajoutée ici. */
@Composable
private fun VitrineLockedRow(lock: VitrineLock) {
    MeeshyLockedRow(
        title = stringResource(lock.capability.title),
        requirement = stringResource(R.string.vitrine_as_opens_from, levelTitle(lock.opensAt, null)),
        tint = lock.opensAt.tint(),
    )
}
