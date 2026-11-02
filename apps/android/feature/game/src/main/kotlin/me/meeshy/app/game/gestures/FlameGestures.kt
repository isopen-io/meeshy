package me.meeshy.app.game.gestures

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.app.game.pages.GameActionButton
import me.meeshy.app.game.pages.GameCard
import me.meeshy.app.game.pages.GameErrorLine
import me.meeshy.app.game.pages.GameNote
import me.meeshy.app.game.pages.count
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.FlameStatus
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameFlameLaw
import me.meeshy.sdk.model.game.GameSpend
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.text.font.FontWeight

/**
 * LA FLAMME : VEILLEUSES ET RALLUMAGE (iOS `GameFlamePanelView`) — ce qu'on fait de ses Meeshes pour la protéger. Les
 * prix et les bornes viennent du bloc `game` : cette vue n'en connaît aucun. Une Veilleuse couvre un jour manqué (deux
 * en réserve au plus) ; une Flamme éteinte se rallume sous 48 h, une fois par mois.
 *
 * Un bouton qui ne peut pas servir se TAIT en disant pourquoi (réserve pleine, pas assez de Meeshes, hors ligne) ; avant
 * chaque achat, la rangée de dépense dit les Meeshes en poche et le prix — ou combien il en manque. Aucun nombre n'est
 * calculé ici : le nombre de Veilleuses et la série rallumée sont ceux que la passerelle sert après le geste.
 */
@Composable
internal fun FlamePanel(game: GameBlock, gestures: GameGesturesUiState, onBuyFreeze: () -> Unit, onRelight: () -> Unit) {
    val flame = game.flame
    val held = game.treasury.held.toLong()
    val freezeSpend = GameSpend.preview(held, flame.freezePrice.toLong())
    val relightSpend = GameSpend.preview(held, flame.relightPrice.toLong())
    val isOut = flame.status == FlameStatus.Out
    GameCard(title = stringResource(R.string.game_flame_panel_title)) {
        GameNote(stringResource(R.string.game_flame_panel_bonus, count(GameFlameLaw.BONUS_PERCENT_PER_DAY), count(GameFlameLaw.BONUS_PERCENT_MAX)))
        Text(
            stringResource(R.string.game_flame_panel_freezes, count(flame.freezes), count(flame.maxFreezes)),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        if (flame.freezes >= flame.maxFreezes) {
            GameNote(stringResource(R.string.game_flame_panel_freeze_full))
        } else {
            SpendRow(freezeSpend, { meeshes(it) }, { stringResource(R.string.game_spend_missing_freeze, it) })
            GameActionButton(
                title = stringResource(R.string.game_flame_panel_freeze_buy, meeshes(flame.freezePrice.toLong())),
                onClick = onBuyFreeze,
                busy = gestures.buyingFreeze,
                enabled = gestures.online && freezeSpend.affordable,
                tint = MeeshyPalette.Warning,
                ink = MeeshyPalette.Indigo950,
            )
        }
        GameErrorLine(gestureMessage(gestures.failures[GameGesture.Freeze]))
        when {
            isOut && flame.canRelight -> {
                GameNote(stringResource(R.string.game_flame_panel_relight_intro))
                SpendRow(relightSpend, { meeshes(it) }, { stringResource(R.string.game_spend_missing_relight, it) })
                GameActionButton(
                    title = stringResource(R.string.game_flame_panel_relight, meeshes(flame.relightPrice.toLong())),
                    onClick = onRelight,
                    busy = gestures.relighting,
                    enabled = gestures.online && relightSpend.affordable,
                    tint = MeeshyPalette.Warning,
                    ink = MeeshyPalette.Indigo950,
                )
                GameErrorLine(gestureMessage(gestures.failures[GameGesture.Relight]))
            }
            isOut && !relightSpend.affordable -> {
                GameNote(stringResource(R.string.game_flame_panel_relight_missing_window, meeshes(flame.relightPrice.toLong())))
                SpendRow(relightSpend, { meeshes(it) }, { stringResource(R.string.game_spend_missing_relight, it) })
            }
            isOut -> GameNote(stringResource(R.string.game_flame_panel_relight_closed), tone = MeeshyPalette.Indigo500)
        }
        if (!gestures.online) GameNote(stringResource(R.string.game_flame_panel_offline))
    }
}
