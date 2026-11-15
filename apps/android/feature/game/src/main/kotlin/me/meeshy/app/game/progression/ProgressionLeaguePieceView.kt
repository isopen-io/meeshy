package me.meeshy.app.game.progression

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.app.game.pages.GameCard
import me.meeshy.app.game.pages.GameNote
import me.meeshy.app.game.pages.LeagueGem
import me.meeshy.app.game.pages.count
import me.meeshy.app.game.pages.durationText
import me.meeshy.app.game.pages.gemColor
import me.meeshy.app.game.pages.leagueNameRes
import me.meeshy.app.game.pages.points
import me.meeshy.app.game.pages.rememberMinuteClock
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.pages.GameWeekClock
import me.meeshy.sdk.model.game.progression.ProgressionLeaguePiece
import me.meeshy.ui.component.game.GameBounceButton
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LE DÉTAIL DE LA JOUTE, en tête de sa fiche (miroir de `GameLeagueDetailCard`, iOS) : la gemme du cercle, son nom, la
 * place dans le groupe et les points de la semaine, puis le temps jusqu'à la fermeture, redit à la minute. Toute la
 * carte se touche (rebond figé sous « réduire les animations ») et ouvre la page de la joute ; un seul élément pour le
 * lecteur d'écran.
 */
@Composable
internal fun LeaguePiece(piece: ProgressionLeaguePiece, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val now by rememberMinuteClock()
    val closes = stringResource(R.string.game2_league_closes, durationText(GameWeekClock.remaining(piece.closes, now)))
    val place = stringResource(R.string.game2_league_rank_line, count(piece.rank), count(piece.groupSize)) +
        " · " + stringResource(R.string.game_league_detail_week, points(piece.weekPoints))
    GameBounceButton(onClick = onOpen, modifier = modifier.testTag(LEAGUE_PIECE_TAG)) {
        GameCard(tint = gemColor(piece.league)) {
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md), verticalAlignment = Alignment.CenterVertically) {
                LeagueGem(piece.league, GEM)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                    Text(
                        stringResource(leagueNameRes(piece.league)),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = tokens.textPrimary,
                    )
                    Text(place, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary)
                    GameNote(closes)
                }
                Icon(MeeshyIcons.ChevronForward, contentDescription = null, tint = tokens.textMuted, modifier = Modifier.size(16.dp))
            }
        }
    }
}

internal const val LEAGUE_PIECE_TAG = "game.league.detail"
private val GEM = 48.dp
