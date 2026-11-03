package me.meeshy.sdk.model.game

import kotlinx.serialization.json.JsonElement

/** L'état du jeu tenu en cache : son bloc lu et la révision gravée par la passerelle (`null` : serveur antérieur). */
public data class GameRevisionState(val revision: Long?, val block: GameBlock)

/** Ce que la fusion d'un état reçu décide. */
public sealed interface GameMergeOutcome {
    /** L'état reçu est plus ancien que le cache : il est ignoré. */
    public data object Keep : GameMergeOutcome

    /** L'état reçu remplace celui du cache. */
    public data class Replace(val state: GameRevisionState) : GameMergeOutcome

    /** Le bloc reçu est illisible ou absent : rien ne remplace le cache, la progression se relit. */
    public data object Refetch : GameMergeOutcome
}

/**
 * La fusion d'un état de jeu reçu (événement `game:updated`, lecture, réponse d'écriture) avec celui du cache. Miroir de
 * `shouldApplyGameState` (`packages/shared/types/game-sync-order.ts`) : seul un état STRICTEMENT plus ancien est
 * ignoré ; à révision égale, ou sans révision d'un côté, le reçu remplace. Un bloc illisible se lit `null`
 * ([GameBlockParser]) et déclenche la relecture, jamais un état fabriqué.
 */
public object GameRevisionMerge {

    public fun merge(cached: GameRevisionState?, incomingRevision: Long?, incomingBlock: JsonElement?): GameMergeOutcome {
        if (!shouldApplyGameState(incomingRevision, cached?.revision)) return GameMergeOutcome.Keep
        val block = GameBlockParser.parse(incomingBlock) ?: return GameMergeOutcome.Refetch
        return GameMergeOutcome.Replace(GameRevisionState(incomingRevision ?: cached?.revision, block))
    }

    public fun merge(cached: GameRevisionState?, event: GameUpdatedEvent): GameMergeOutcome =
        merge(cached, event.gameRevision, event.game)
}
