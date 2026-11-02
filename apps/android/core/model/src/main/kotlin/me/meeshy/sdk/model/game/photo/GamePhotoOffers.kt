package me.meeshy.sdk.model.game.photo

import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GamePhotoCatchUpLaw
import me.meeshy.sdk.model.game.PhotoCatchUpStanding

/**
 * Ce que les propositions ont déjà vu dans la séance (iOS `GamePhotoCoordinator`) : le dernier bloc CONFIRMÉ, les
 * moments déjà produits par une transition, et ceux déjà proposés.
 */
public data class PhotoOfferMemory(
    val previous: GameBlock? = null,
    val proposed: Set<String> = emptySet(),
    val offered: Set<String> = emptySet(),
)

/** Une transition observée : la mémoire nouvelle et les moments neufs qu'elle produit (vides le plus souvent). */
public data class PhotoOfferObservation(val memory: PhotoOfferMemory, val moments: List<GamePhotoMoment>)

/**
 * LES PROPOSITIONS DE PHOTO (#9382, #9961, #13891) — miroir de `GamePhotoCoordinator` (iOS). Mee propose APRÈS la
 * célébration, jamais à l'OUVERTURE (un état n'est pas une célébration), jamais deux fois le même moment dans la séance,
 * jamais un moment que la Chronique connaît déjà, et jamais pendant qu'un geste est en vol (`settled` faux : la
 * lecture montrée est l'optimiste). Une transition ne propose qu'UN moment, le plus marquant, et jamais une étape qui
 * en saute une autre : l'étape OUVERTE de sa piste est proposée à sa place.
 */
public object GamePhotoOffers {

    public fun observe(memory: PhotoOfferMemory, game: GameBlock, settled: Boolean): PhotoOfferObservation {
        if (!settled) return PhotoOfferObservation(memory, emptyList())
        val before = memory.previous ?: return PhotoOfferObservation(memory.copy(previous = game), emptyList())
        val moments = GamePhotoMoments.ofTransition(before, game).filterNot { it.id in memory.proposed }
        return PhotoOfferObservation(
            memory.copy(previous = game, proposed = memory.proposed + moments.map { it.id }),
            moments,
        )
    }

    /**
     * LA proposition parmi les moments d'une transition, ou `null` : rien à proposer, moment déjà connu de la Chronique
     * ([known] : gardé ou en attente), déjà proposé dans la séance, ou une proposition attend encore un geste.
     */
    public fun choose(
        moments: List<GamePhotoMoment>,
        game: GameBlock,
        kept: Set<String>,
        known: Set<String>,
        memory: PhotoOfferMemory,
        hasPendingOffer: Boolean,
    ): GamePhotoMoment? {
        if (moments.isEmpty() || hasPendingOffer) return null
        val standing = PhotoCatchUpStanding.of(game)
        val id = GamePhotoCatchUpLaw.offer(moments.map { it.id }, standing, kept) ?: return null
        val chosen = moments.firstOrNull { it.id == id }
            ?: GamePhotoCatchUpLaw.stepsReached(standing).firstOrNull { it.id == id }?.let(GamePhotoMoments::of)
            ?: return null
        return chosen.takeUnless { it.id in known || it.id in memory.offered }
    }
}
