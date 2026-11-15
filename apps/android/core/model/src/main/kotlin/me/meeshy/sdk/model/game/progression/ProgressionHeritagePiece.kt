package me.meeshy.sdk.model.game.progression

import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameMint
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.TreasuryStanding
import me.meeshy.sdk.model.game.engagement.EngagementProgress

/** La dernière pièce frappée : son numéro, et l'édition qu'on y DESSINE (iOS `GameHeritageCoin`, #11483). */
public data class HeritageCoin(val number: Int, val edition: MeeshEdition) {
    public companion object {
        public fun of(number: Int): HeritageCoin = HeritageCoin(number, GameMint.displayEdition(number))
    }
}

/**
 * LA TÊTE DE L'HÉRITAGE (miroir de `GameHeritageHeadModel`, iOS #11180) — « qu'est-ce que je garde ? » : le contenant
 * en petit (« Ton Coffret », il se touche), les Meeshes gardées en grand, le contenant suivant, les frappées depuis
 * toujours, et la DERNIÈRE pièce frappée en emblème (le flan d'argent quand rien n'a été frappé). Aucun prix : il vit
 * dans le cadre de la frappe, une fois. Ce que l'état SERT, rien de calculé : le portefeuille d'abord, le trésor à défaut.
 */
public data class ProgressionHeritagePiece(
    val label: GameText,
    /** Le contenant se touche quand il existe (iOS `facts: [.treasuryTier]`). */
    val tierOpens: Boolean,
    val held: GameText,
    /** « le Coffre s'ouvre à 100 » ; `null` à la dernière réserve. */
    val opens: GameText?,
    /** « 91 frappées depuis toujours » ; `null` quand rien n'a été frappé ou que le serveur ne le sert pas. */
    val minted: GameText?,
    val coin: HeritageCoin?,
) {
    /** Les faits que la tête montre, dans l'ordre de lecture. */
    val facts: List<ConceptFact>
        get() = listOfNotNull(
            ConceptFact.TreasuryTier.takeIf { tierOpens },
            ConceptFact.MeeshHeld,
            opens?.let { ConceptFact.TreasuryNext },
            minted?.let { ConceptFact.Minted },
        )

    public companion object {
        public fun of(balance: Int, treasury: TreasuryStanding, minted: Int?): ProgressionHeritagePiece {
            val struck = minted?.takeIf { it > 0 }
            return ProgressionHeritagePiece(
                label = GameCopyLaws.treasuryHeld(treasury.tier),
                tierOpens = treasury.tier != null,
                held = GameCopyLaws.meeshes(balance),
                opens = treasury.next?.let { GameCopyLaws.treasuryOpens(it.key, it.minHeld) },
                minted = struck?.let { GameText.of(GameTextKey.FicheHeritageMinted, GameTextArg.Count(it)) },
                coin = struck?.let(HeritageCoin::of),
            )
        }

        /** Ce que l'état SERT : les Meeshes du portefeuille (le trésor à défaut), le contenant du jeu, les frappées. */
        public fun served(progress: EngagementProgress, game: GameBlock): ProgressionHeritagePiece =
            of(progress.meesh?.balance ?: game.treasury.held, game.treasury, progress.meesh?.mintedLifetime)
    }
}
