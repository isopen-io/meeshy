package me.meeshy.sdk.model.links

import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.sdk.model.CreateAffiliateTokenRequest

/** Le formulaire « Nouveau lien » de parrainage (iOS `AffiliateCreateView`). */
data class AffiliateCreateForm(
    val name: String = "",
    val maxUses: String = "",
) {
    private val trimmedName: String get() = name.trim()

    val isSubmittable: Boolean get() = trimmedName.isNotEmpty()

    /** Les seuls chiffres sont retenus : le champ est numérique, un collage ne le corrompt pas. */
    fun withMaxUses(raw: String): AffiliateCreateForm = copy(maxUses = raw.filter(Char::isDigit).take(MAX_DIGITS))

    /** `null` tant que le nom est vide ; un plafond absent ou nul est « illimité » (jamais `0`). */
    fun request(): CreateAffiliateTokenRequest? {
        if (!isSubmittable) return null
        return CreateAffiliateTokenRequest(name = trimmedName, maxUses = maxUses.toIntOrNull()?.takeIf { it > 0 })
    }

    private companion object {
        const val MAX_DIGITS = 7
    }
}

/** La liste des jetons de parrainage et ses totaux (iOS `AffiliateView.statsOverview`). */
data class AffiliateTokensState(
    val tokens: List<AffiliateToken> = emptyList(),
) {
    val linkCount: Int get() = tokens.size
    val signupCount: Int get() = tokens.sumOf { it.referralCount }
    val clickCount: Int get() = tokens.sumOf { it.clickCount }

    fun prepended(token: AffiliateToken): AffiliateTokensState =
        copy(tokens = listOf(token) + tokens.filterNot { it.id == token.id })

    fun removed(id: String): AffiliateTokensState = copy(tokens = tokens.filterNot { it.id == id })
}
