package me.meeshy.ui.component.retouch

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.composer.look.ComposerLookFamily
import me.meeshy.sdk.model.composer.look.ComposerLookStripItem
import me.meeshy.sdk.model.composer.look.ComposerLookStripRule
import me.meeshy.sdk.model.composer.look.StoryMediaLookMapping
import me.meeshy.ui.theme.MeeshySpacing

/** Les familles et les cases de la section : celles de la retouche, avec les effets que la plateforme sait peindre. */
internal object ComposerMediaLookPanelRule {
    val families: List<ComposerLookFamily> = ComposerLookStripRule.families(RetouchRenderableEffects)

    fun items(family: ComposerLookFamily): List<ComposerLookStripItem> = ComposerLookStripRule.items(family, effects = RetouchRenderableEffects)
}

/**
 * **LA SECTION « FILTRES ET CADRES » D'UN MÉDIA DE LA SCÈNE** (#13841, miroir de `ComposerMediaLookPanel` iOS) : les
 * mêmes familles, les mêmes cases et les mêmes mots que la retouche ; mais toucher une case écrit un RÉGLAGE du média
 * ([onChoose]) — même identifiant, même fichier, annulable, relu à la réouverture —, jamais un fichier cuit. [families] :
 * celles que l'hôte sert ici — le fond sépare Filtres et Cadres (#13973) ; une seule famille ne montre pas son choix.
 */
@Composable
public fun ComposerMediaLookPanel(
    look: StoryMediaLook?,
    onChoose: (ComposerLookStripItem) -> Unit,
    modifier: Modifier = Modifier,
    families: List<ComposerLookFamily> = ComposerMediaLookPanelRule.families,
) {
    val served = families.filter { it in ComposerMediaLookPanelRule.families }
    var picked by rememberSaveable(served) { mutableStateOf(served.firstOrNull() ?: ComposerLookFamily.FILTERS) }
    val family = picked.takeIf { it in served } ?: served.firstOrNull() ?: return
    val chosen = StoryMediaLookMapping.photoLook(look)
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        if (served.size > 1) Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            served.forEach { candidate ->
                FilterChip(
                    selected = candidate == family,
                    onClick = { picked = candidate },
                    label = { Text(stringResource(ComposerRetouchCopy.family(candidate))) },
                    leadingIcon = { Icon(ComposerRetouchCopy.familyIcon(candidate), contentDescription = null) },
                )
            }
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            ComposerMediaLookPanelRule.items(family).forEach { item ->
                FilterChip(
                    selected = ComposerLookStripRule.isChosen(item, chosen),
                    onClick = { onChoose(item) },
                    label = { Text(ComposerRetouchCopy.itemName(item), maxLines = 1) },
                )
            }
        }
    }
}
