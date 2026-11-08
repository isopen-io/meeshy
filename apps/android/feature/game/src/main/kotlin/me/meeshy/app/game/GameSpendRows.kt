package me.meeshy.app.game

import me.meeshy.sdk.model.game.RequirementPreview
import me.meeshy.sdk.model.game.SpendPreview
import me.meeshy.sdk.model.game.progression.GameDetailFactKey

/**
 * UNE DONNÉE QUI SE TOUCHE, dans une rangée posée au-dessus d'un geste (iOS `GameFactChipItem`) : son libellé, sa valeur,
 * et la phrase qu'ouvre son toucher ([detail]). [short] : la valeur dit un MANQUE, la pastille prend la teinte d'alerte.
 * [sentence] : ce qu'il manque, en une phrase qui nomme sa cible — la pastille la dit alors en entier. [gesture] nomme le
 * geste visé, pour que la lecture d'écran ne dise jamais un chiffre sans dire pour quoi.
 */
internal data class GameFactChipItem(
    val label: String,
    val value: String,
    val detail: GameDetailFactKey,
    val short: Boolean = false,
    val sentence: String? = null,
    val gesture: String? = null,
) {
    /** Ce que dit la lecture d'écran : la phrase du manque, ou « libellé, valeur », puis le geste visé. */
    val spoken: String
        get() = listOfNotNull(sentence ?: "$label, $value", gesture).joinToString(". ")
}

/** Les trois libellés d'une rangée de dépense, résolus par l'hôte (la rangée ne lit aucune ressource). */
internal data class SpendLabels(val held: String, val cost: String, val after: String)

/** Les libellés d'une rangée d'exigence : ton niveau (ou ton record), puis le niveau requis. */
internal data class RequirementLabels(val current: String, val required: String)

/**
 * Les rangées de ce qu'un geste dépense ou exige — miroir de `GameSpendRows` (iOS) et de `game-spend-line.tsx` (web).
 * Pur : les chiffres viennent de la loi (`GameSpend`), les libellés de l'hôte. Abordable : ce qu'on a · ce qu'il faut ·
 * ce qui restera. Insuffisant : la même paire, puis CE QU'IL MANQUE en une phrase qui nomme sa cible.
 */
internal object GameSpendRows {

    /** Le manque d'un geste, dit en une phrase qui nomme sa cible : la pastille la porte en entier. */
    fun missingItem(sentence: String, amount: String, detail: GameDetailFactKey, gesture: String? = null): GameFactChipItem =
        GameFactChipItem(label = sentence, value = amount, detail = detail, short = true, sentence = sentence, gesture = gesture)

    fun spend(
        spend: SpendPreview,
        labels: SpendLabels,
        format: (Long) -> String,
        missing: (String) -> String,
        formatMissing: ((Long) -> String)? = null,
        heldFact: GameDetailFactKey = GameDetailFactKey.SpendHeld,
        missingFact: GameDetailFactKey = GameDetailFactKey.SpendMissing,
        between: GameFactChipItem? = null,
        showsAfter: Boolean = true,
    ): List<GameFactChipItem> {
        val gesture = spend.gesture
        val head = GameFactChipItem(labels.held, format(spend.held), heldFact, gesture = gesture)
        val cost = GameFactChipItem(labels.cost, format(spend.cost), GameDetailFactKey.SpendCost, gesture = gesture)
        val last = when {
            !spend.affordable -> {
                val amount = (formatMissing ?: format)(spend.missing)
                missingItem(missing(amount), amount, missingFact, gesture)
            }
            showsAfter -> GameFactChipItem(labels.after, format(spend.after), GameDetailFactKey.SpendAfter, gesture = gesture)
            else -> null
        }
        return listOfNotNull(head, between, cost, last)
    }

    /**
     * Ton niveau (ou ton record) · Requis, puis ce qu'il manque pour l'ouvrir — le manque se tait quand l'exigence est
     * remplie.
     */
    fun requirement(
        requirement: RequirementPreview,
        labels: RequirementLabels,
        format: (Long) -> String,
        missing: (String) -> String,
        record: Boolean = false,
        formatMissing: ((Long) -> String)? = null,
    ): List<GameFactChipItem> {
        val gesture = requirement.gesture
        val currentFact = if (record) GameDetailFactKey.LevelRecord else GameDetailFactKey.LevelNow
        val current = GameFactChipItem(labels.current, format(requirement.current), currentFact, gesture = gesture)
        val required = GameFactChipItem(labels.required, format(requirement.required), GameDetailFactKey.LevelRequired, gesture = gesture)
        if (requirement.met) return listOf(current, required)
        val amount = (formatMissing ?: format)(requirement.missing)
        return listOf(current, required, missingItem(missing(amount), amount, GameDetailFactKey.SpendMissing, gesture))
    }
}
