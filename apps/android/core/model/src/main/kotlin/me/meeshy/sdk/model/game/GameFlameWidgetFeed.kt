package me.meeshy.sdk.model.game

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import me.meeshy.sdk.model.game.pages.GameDevicePrefs

/**
 * **« Ma Flamme »** (#20566, miroir Android de #20562) — ce que le widget d'écran d'accueil montre, LU dans le bloc `game`
 * servi : jours et état de la Flamme (`flame.days`, `flame.status`), actes du jour réalisés sur ceux du jour par la loi
 * de l'anneau ([GameActsRing]). Miroir de `GameFlameWidgetFeed` + `GameFlameLook` iOS
 * (`apps/ios/Meeshy/Features/Game/GameFlameWidgetFeed.swift`, `apps/ios/MeeshyWidgets/GameFlameWidget.swift`).
 *
 * Aucune règle recalculée, rien d'autrui. « Jeu masqué » ⇒ [GameFlameWidgetState.Hidden], qui vide le widget (aucun
 * texte, aucun lien). Sans session ou à froid ⇒ l'invitation au premier geste, jamais la Flamme du compte sortant.
 */
public object GameFlameWidgetFeed {
    public fun state(game: GameBlock?, hidden: Boolean, signedIn: Boolean): GameFlameWidgetState {
        if (!signedIn) return GameFlameWidgetState.Shown(GameFlameWidgetFace.INVITE)
        if (hidden) return GameFlameWidgetState.Hidden
        if (game == null) return GameFlameWidgetState.Shown(GameFlameWidgetFace.INVITE)
        val ring = GameActsRing.of(game, hidden = false)
        return GameFlameWidgetState.Shown(
            GameFlameWidgetFace(
                days = game.flame.days,
                look = GameFlameLook.of(game.flame.status),
                actsDone = ring?.done ?: 0,
                actsTotal = ring?.total ?: 0,
            ),
        )
    }

    /**
     * Ce que le widget montre, au fil du compte, de « Jeu masqué » et du bloc caché : une valeur par CHANGEMENT de la
     * face, jamais pour une réécriture du bloc qui ne la touche pas (iOS : rechargé seulement si le cliché change).
     */
    public fun changes(
        signedInUser: Flow<String?>,
        prefs: Flow<GameDevicePrefs>,
        game: Flow<GameBlock?>,
    ): Flow<GameFlameWidgetState> =
        combine(signedInUser, prefs, game) { user, devicePrefs, block ->
            state(block, hidden = devicePrefs.hidden, signedIn = !user.isNullOrBlank())
        }.distinctUntilChanged()
}

/** Ce que le widget peint : la Flamme, ou rien du tout (« Jeu masqué »). */
public sealed interface GameFlameWidgetState {
    public data object Hidden : GameFlameWidgetState

    public data class Shown(val face: GameFlameWidgetFace) : GameFlameWidgetState
}

/** La face du widget : la forme de la Flamme, ses jours, et les actes du jour (`actsTotal == 0` : aucun acte servi). */
public data class GameFlameWidgetFace(
    val days: Int,
    val look: GameFlameLook,
    val actsDone: Int,
    val actsTotal: Int,
) {
    /** Les jours se disent pour une Flamme allumée (vive, à risque, gardée), jamais éteinte ni jamais allumée. */
    val showsDays: Boolean get() = days > 0 && look.isKindled

    /** « Actes du jour : n sur 3 », seulement si le jour servi a des actes. */
    val showsActs: Boolean get() = actsTotal > 0

    val actsDoneShown: Int get() = actsDone.coerceIn(0, actsTotal.coerceAtLeast(0))

    public companion object {
        /** Rien de publié (cache vide, sans session) : « Un geste aujourd'hui allume ta Flamme ». */
        public val INVITE: GameFlameWidgetFace = GameFlameWidgetFace(days = 0, look = GameFlameLook.Unlit, actsDone = 0, actsTotal = 0)
    }
}

/** La forme de la Flamme selon l'état servi (iOS `GameFlameLook`). */
public enum class GameFlameLook {
    Lit,
    AtRisk,
    Covered,
    Out,
    Unlit,
    ;

    /** Glyphe plein : la Flamme brûle (vive, à risque, gardée par une Veilleuse). */
    public val isKindled: Boolean get() = this == Lit || this == AtRisk || this == Covered

    public companion object {
        public fun of(status: FlameStatus): GameFlameLook = when (status) {
            FlameStatus.Lit -> Lit
            FlameStatus.AtRisk -> AtRisk
            FlameStatus.Covered -> Covered
            FlameStatus.Out -> Out
            FlameStatus.None -> Unlit
        }
    }
}
