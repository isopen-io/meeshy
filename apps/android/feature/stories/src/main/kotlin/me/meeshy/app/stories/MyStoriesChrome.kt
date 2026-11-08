package me.meeshy.app.stories

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.MyStoriesTab
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La barre d'outils d'une feuille : « + » rond de 32 dp en verre teinté de l'accent, le titre, « Sélectionner /
 * Annuler » (seulement quand il y a des stories à sélectionner) et « OK ». Le plus laisse la feuille se fermer avant
 * d'ouvrir le composeur (la navigation s'en charge).
 */
@Composable
internal fun MyStoriesToolbar(
    accent: Color,
    canSelect: Boolean,
    isSelecting: Boolean,
    onCreate: () -> Unit,
    onToggleSelecting: () -> Unit,
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        val createLabel = stringResource(R.string.my_stories_create)
        Box(Modifier.heightIn(min = 48.dp).size(48.dp).clickable(role = Role.Button, onClickLabel = createLabel, onClick = onCreate)
            .semantics { contentDescription = createLabel }, contentAlignment = Alignment.Center) {
            MeeshyGlassSurface(shape = CircleShape, tint = accent, modifier = Modifier.size(32.dp)) {
                Icon(MeeshyIcons.Add, null, tint = Color.White, modifier = Modifier.align(Alignment.Center).size(18.dp))
            }
        }
        Text(
            stringResource(R.string.my_stories_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f),
        )
        if (canSelect) {
            val label = stringResource(if (isSelecting) R.string.my_stories_select_cancel else R.string.my_stories_select)
            Box(Modifier.heightIn(min = 48.dp).clickable(role = Role.Button, onClick = onToggleSelecting).semantics { contentDescription = label },
                contentAlignment = Alignment.Center) {
                MeeshyGlassSurface(shape = RoundedCornerShape(50)) {
                    Text(
                        stringResource(if (isSelecting) R.string.my_stories_cancel else R.string.my_stories_select),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyTheme.tokens.textPrimary,
                        modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xsPlus),
                    )
                }
            }
        }
        Box(Modifier.heightIn(min = 48.dp).clickable(role = Role.Button, onClick = onDone), contentAlignment = Alignment.Center) {
            MeeshyGlassSurface(shape = RoundedCornerShape(50), tint = accent) {
                Text(
                    stringResource(R.string.my_stories_ok),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                    modifier = Modifier.padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.xsPlus),
                )
            }
        }
    }
}

/** Le sélecteur à quatre onglets, segmenté : jamais un pager, dont le geste horizontal gênerait la fermeture. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MyStoriesTabPicker(
    tabs: List<MyStoriesTab>,
    selected: MyStoriesTab,
    onSelect: (MyStoriesTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    SingleChoiceSegmentedButtonRow(modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)) {
        tabs.forEachIndexed { index, tab ->
            SegmentedButton(
                selected = tab == selected,
                onClick = { if (tab != selected) onSelect(tab) },
                shape = SegmentedButtonDefaults.itemShape(index, tabs.size),
            ) {
                Text(stringResource(tab.titleRes()), maxLines = 1)
            }
        }
    }
}

private fun MyStoriesTab.titleRes(): Int = when (this) {
    MyStoriesTab.PUBLISHED -> R.string.my_stories_tab_published
    MyStoriesTab.QUEUE -> R.string.my_stories_tab_queue
    MyStoriesTab.DRAFTS -> R.string.my_stories_tab_drafts
    MyStoriesTab.ARCHIVE -> R.string.my_stories_tab_archive
}
