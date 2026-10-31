package me.meeshy.sdk.model

/**
 * Ce qu'un lecteur a VU d'une flamme-œil pendant sa visite — miroir de iOS
 * `AfterReadVisit` (`ConversationViewModel+AfterRead.swift`, #8303).
 *
 * La disparition est PAR LECTEUR (contrat #8302) : seuls les messages REÇUS comptent —
 * l'expéditeur garde le sien jusqu'à ce que tous l'aient vu —, et seulement ceux qui ont
 * été AFFICHÉS : un message resté hors écran n'a pas été lu, il ne part pas. Valeur pure :
 * le ViewModel l'alimente depuis la même preuve d'affichage que les accusés de lecture,
 * et la vide à la sortie.
 */
data class AfterReadVisit(val displayed: Set<String> = emptySet()) {

    /** Retient, parmi [displayed], les flammes-œil REÇUES de [among]. */
    fun noting(
        displayed: Collection<String>,
        among: List<ApiMessage>,
        isMine: (ApiMessage) -> Boolean,
    ): AfterReadVisit {
        if (displayed.isEmpty()) return this
        val shown = displayed.toSet()
        val fresh = among.filter { it.id in shown && isConsumable(it, isMine) }.map { it.id }
        if (fresh.all { it in this.displayed }) return this
        return copy(displayed = this.displayed + fresh)
    }

    /** Rend ce qui a été vu (trié), et la visite vidée : la seconde sortie ne trouve plus rien. */
    fun takeAll(): Pair<List<String>, AfterReadVisit> = displayed.sorted() to AfterReadVisit()

    companion object {
        fun isConsumable(message: ApiMessage, isMine: (ApiMessage) -> Boolean): Boolean =
            !isMine(message) &&
                message.deletedAt == null &&
                message.effects.has(MessageEffectFlags.EPHEMERAL_AFTER_READ)
    }
}
