package me.meeshy.app.game.gestures

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import me.meeshy.app.game.GameErrorMessages
import me.meeshy.app.game.gameString
import me.meeshy.app.game.pages.GameChip
import me.meeshy.app.game.pages.GameNote
import me.meeshy.app.game.pages.currentLocale
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.SpendPreview
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * La phrase du refus d'un geste : jamais un code. Hors ligne, rien n'est parti ; sinon la passerelle a répondu et
 * `GameErrorMessages` met son code en phrase (un code inconnu rend la phrase générique).
 */
@Composable
internal fun gestureMessage(failure: GameGestureFailure?): String? {
    failure ?: return null
    val resources = LocalContext.current.resources
    val locale = currentLocale()
    return if (failure.offline) stringResource(R.string.game2_offline_action) else GameErrorMessages.message(resources, failure.code, locale)
}

/**
 * Ce qu'un geste dépense, dit AVANT le geste (iOS `GameSpendRows.spend`) : ce qu'on a, ce que ça coûte et, quand le
 * solde ne suffit pas, ce qui manque en une phrase qui nomme sa cible. **Jamais ce qui restera après** : la
 * soustraction est celle de la passerelle, l'écran n'en calcule aucune. [spend] ne sert qu'à rendre le geste possible ou non.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SpendRow(spend: SpendPreview, format: @Composable (Long) -> String, missing: @Composable (String) -> String) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            GameChip(stringResource(R.string.game_concept_fact_balance) + " · " + format(spend.held))
            GameChip(stringResource(R.string.game_concept_fact_cost) + " · " + format(spend.cost))
        }
        if (!spend.affordable) GameNote(missing(format(spend.missing)), tone = MeeshyPalette.Warning)
    }
}

/** Des Meeshes, dites par la loi du jeu (« 1 Meesh », « 3 Meeshes »). */
@Composable
internal fun meeshes(count: Long): String = gameString(GameCopyLaws.meeshes(count.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()))
