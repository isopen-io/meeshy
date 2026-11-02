package me.meeshy.sdk.model.game.pages

import me.meeshy.sdk.model.game.GameVisibility
import me.meeshy.sdk.model.game.ShowcaseVisibility
import me.meeshy.sdk.model.game.ShowcaseVisibilityRequest

/** Le rangement d'une vitrine (iOS `GameShowcaseRules.moved`) — pur, pour qu'un test l'éprouve sans écran. */
public object GameShowcaseRules {

    /** Monter ou descendre d'un cran ; la même suite quand le geste n'a pas de sens (bord de la vitrine). */
    public fun moved(order: List<String>, index: Int, delta: Int): List<String> {
        val target = index + delta
        if (index !in order.indices || target !in order.indices) return order
        return order.toMutableList().also { it[index] = order[target]; it[target] = order[index] }
    }
}

/**
 * Aujourd'hui le nom de joute CHOISI est fermé (conformité A-5) : la passerelle refuse tout nom choisi tant que le filtre
 * d'injures, le signalement par ligne et la décision motivée ne sont pas ouverts. Proposer le champ ferait échouer le
 * geste de qui le remplit. Le jour où le contrat dira que le choix est ouvert, ce drapeau le lira (iOS
 * `GameLeagueRules.chosenPseudonymOpen`).
 */
public object GameLeagueRules {
    public const val CHOSEN_PSEUDONYM_OPEN: Boolean = false
}

/** Les quatre facettes de « qui voit quoi » (iOS `GameVisibility`). */
public enum class VisibilityField { Rank, Treasury, Showcase, Atlas }

/**
 * Régler UNE facette : ce que la requête porte (les autres restent absentes, la passerelle ne les touche pas) et la
 * valeur que l'écran montre pendant le vol. La passerelle reste maître : elle plafonne (« caché de la recherche » ne
 * dépasse pas « amis ») et répond avec la valeur EFFECTIVE, que la relecture pose.
 */
public object GameVisibilityEdit {

    public fun request(requestId: String, field: VisibilityField, level: ShowcaseVisibility): ShowcaseVisibilityRequest =
        when (field) {
            VisibilityField.Rank -> ShowcaseVisibilityRequest(requestId, rank = level)
            VisibilityField.Treasury -> ShowcaseVisibilityRequest(requestId, treasury = level)
            VisibilityField.Showcase -> ShowcaseVisibilityRequest(requestId, showcase = level)
            VisibilityField.Atlas -> ShowcaseVisibilityRequest(requestId, atlas = level)
        }

    public fun read(visibility: GameVisibility, field: VisibilityField): ShowcaseVisibility = when (field) {
        VisibilityField.Rank -> visibility.rank
        VisibilityField.Treasury -> visibility.treasury
        VisibilityField.Showcase -> visibility.showcase
        VisibilityField.Atlas -> visibility.atlas
    }

    public fun with(visibility: GameVisibility, field: VisibilityField, level: ShowcaseVisibility): GameVisibility = when (field) {
        VisibilityField.Rank -> visibility.copy(rank = level)
        VisibilityField.Treasury -> visibility.copy(treasury = level)
        VisibilityField.Showcase -> visibility.copy(showcase = level)
        VisibilityField.Atlas -> visibility.copy(atlas = level)
    }
}
