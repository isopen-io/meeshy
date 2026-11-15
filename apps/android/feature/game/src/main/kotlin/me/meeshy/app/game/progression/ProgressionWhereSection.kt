package me.meeshy.app.game.progression

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.app.game.gameString
import me.meeshy.sdk.model.game.progression.FicheFact
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.sdk.model.game.progression.ProgressionConceptFiche
import me.meeshy.ui.component.game.GameBounceButton
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le contenu de « Où j'en suis » (iOS `ProgressionConceptContent`, section `ficheWhere`) : la phrase d'état en gras,
 * puis les lignes « libellé → valeur » (iOS `ProgressionConceptFacts`), chacune UN élément pour le lecteur d'écran. Ce
 * que la loi écarte (un fait déjà à l'écran) n'arrive jamais ici.
 *
 * Avec un [concept], chaque ligne REBONDIT au toucher et ouvre les précisions de CETTE donnée (iOS
 * `GameElementDetails.fact`) ; sans, elle se lit seulement.
 */
@Composable
internal fun ConceptWhereContent(fiche: ProgressionConceptFiche, concept: ProgressionConcept? = null) {
    val tokens = MeeshyTheme.tokens
    var opened by rememberSaveable { mutableStateOf<Int?>(null) }
    Column(Modifier.testTag(WHERE_TAG), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        fiche.state?.let { state ->
            Text(
                gameString(state.text),
                Modifier.testTag(WHERE_STATE_TAG),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = tokens.textPrimary,
            )
        }
        if (fiche.facts.isNotEmpty()) {
            Column {
                fiche.facts.forEachIndexed { index, fact ->
                    if (index > 0) HorizontalDivider(color = tokens.textMuted.copy(alpha = DIVIDER_ALPHA))
                    if (concept == null) {
                        FactRow(fact, Modifier.semantics(mergeDescendants = true) {})
                    } else {
                        // Le bouton fusionne la ligne : UN élément, libellé et valeur, que le lecteur d'écran active.
                        GameBounceButton(onClick = { opened = index }, modifier = Modifier.fillMaxWidth()) { FactRow(fact) }
                    }
                }
            }
        }
    }
    val shown = opened?.let { fiche.facts.getOrNull(it) }
    if (concept != null && shown != null) {
        GameElementSheet(GameElementDetails.fact(shown, concept), onDismiss = { opened = null })
    }
}

@Composable
private fun FactRow(fact: FicheFact, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .padding(vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            gameString(fact.label),
            Modifier.weight(1f),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            color = tokens.textMuted,
        )
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(
            gameString(fact.value),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = tokens.textPrimary,
            textAlign = TextAlign.End,
        )
    }
}

internal const val WHERE_TAG = "progression.concept.where"
internal const val WHERE_STATE_TAG = "progression.concept.state"
private const val DIVIDER_ALPHA = 0.2f
