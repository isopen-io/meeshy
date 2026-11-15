package me.meeshy.sdk.model.game

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * `game:updated` — miroir de `GameUpdatedEventData` (packages/shared/types/game-sync.ts), émis sur `user:<id>` après une
 * frappe, un gain, une reprise, un prestige ou une dépense de Meeshes. `game` est le bloc servi au même instant que
 * `GET /me/engagement` ; il reste brut ici et seul le trésor tenu en est lu ([balance]) : un reste de bloc que ce
 * client ne sait pas lire ne fait pas tomber l'événement ni ne cache le solde. [gameRevision] est le marqueur d'ordre gravé sur le compte (millisecondes).
 */
@Serializable
data class GameUpdatedEvent(
    val gameRevision: Long? = null,
    val reason: String = "",
    val game: JsonElement? = null,
) {
    /** Le solde de Meeshes que dit l'événement (le trésor tenu), ou `null` : relire la vitrine. */
    val balance: Int?
        get() = (((game as? JsonObject)?.get("treasury") as? JsonObject)?.get("held") as? JsonPrimitive)
            ?.takeIf { !it.isString }?.intOrNull?.takeIf { it >= 0 }
}

/**
 * Faut-il appliquer cet état ? Non seulement s'il est STRICTEMENT plus ancien que le dernier appliqué ; à révision égale
 * les deux états s'équivalent, et une source sans révision (serveur antérieur) s'applique toujours (miroir de
 * `shouldApplyGameState`, packages/shared/types/game-sync-order.ts).
 */
fun shouldApplyGameState(incoming: Long?, applied: Long?): Boolean =
    incoming == null || applied == null || incoming >= applied
