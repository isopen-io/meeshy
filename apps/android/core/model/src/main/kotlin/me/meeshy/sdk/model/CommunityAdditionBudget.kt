package me.meeshy.sdk.model

/**
 * Le budget d'ajouts sans accord (#19812, miroir `CommunityAdditionBudget` iOS) : au-delà, la passerelle
 * rend 429 `COMMUNITY_ADDITION_BUDGET_EXCEEDED` (+ `Retry-After`) et n'écrit RIEN. Le refus se DIT à
 * l'auteur (« réessayez plus tard ») sans être rejoué ; un 429 sans ce code reste une panne ordinaire.
 * Il ne dit pas QUI est saturé, l'acteur ou la personne ajoutée (#20664).
 */
object CommunityAdditionBudget {
    const val REFUSAL_CODE: String = "COMMUNITY_ADDITION_BUDGET_EXCEEDED"

    fun isThrottled(httpStatus: Int?, code: String?): Boolean = httpStatus == 429 && code == REFUSAL_CODE
}
