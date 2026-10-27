package me.meeshy.app.game.pages

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.graphics.Color
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GamePrestigeBlock
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LA PAGE « RENAISSANCE » (iOS `GamePrestigePage`) — où j'en suis : les étoiles posées, ce qu'il reste à franchir, et ce
 * que le passage changera. La règle (niveau 100, cinq renaissances au plus) est celle que la passerelle sert.
 *
 * LECTURE SEULE : renaître remet le niveau à 1 et les étincelles à 0 — c'est un geste qui touche le solde, et il vient
 * avec son audit. Cette page n'en promet aucun : elle dit l'état et ce que la renaissance garde et change.
 */
@Composable
fun PrestigeScreen(onBack: () -> Unit) {
    GamePageHost(title = stringResource(R.string.game2_prestige_title), onBack = onBack) { game ->
        PrestigeContent(game)
    }
}

@Composable
private fun PrestigeContent(game: GameBlock) {
    val prestige = game.prestige
    if (prestige == null) {
        GameCard { GameNote(stringResource(R.string.game2_unavailable)) }
        return
    }
    PrestigeSummary(prestige, level = game.level.shown.level)
    if (prestige.canPrestige && prestige.stars < prestige.max) {
        GameCard(title = stringResource(R.string.game2_door_prestige)) {
            GameNote(stringResource(R.string.game2_prestige_mee), tone = MeeshyTheme.tokens.textPrimary)
            GameNote(stringResource(R.string.game2_prestige_meo, count(prestige.gloryOnPass)))
        }
    }
}

@Composable
private fun PrestigeSummary(prestige: GamePrestigeBlock, level: Int) {
    val line = stringResource(R.string.game2_prestige_stars, count(prestige.stars), count(prestige.max))
    GameCard(title = stringResource(R.string.game2_prestige_title), tint = MeeshyPalette.Indigo500) {
        Row(
            Modifier.fillMaxWidth().clearAndSetSemantics { },
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm, Alignment.CenterHorizontally),
        ) {
            repeat(prestige.max) { index ->
                Text(
                    "★",
                    style = MaterialTheme.typography.headlineMedium,
                    color = if (index < prestige.stars) STAR_LIT else MeeshyTheme.tokens.textMuted.copy(alpha = STAR_OFF_ALPHA),
                )
            }
        }
        Text(
            line,
            Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
        )
        when {
            prestige.stars >= prestige.max -> GameNote(stringResource(R.string.game2_prestige_max))
            !prestige.canPrestige -> GameNote(stringResource(R.string.game2_prestige_locked, count(level)))
        }
    }
}

private val STAR_LIT = Color(0xFFE9B949)
private const val STAR_OFF_ALPHA = 0.35f
