package me.meeshy.sdk.model.game.progression

import java.time.Instant
import me.meeshy.sdk.model.game.engagement.EngagementLevelProgress
import me.meeshy.sdk.model.game.engagement.EngagementMeeshProgress

/**
 * LA TÊTE DU NIVEAU SANS BLOC DE JEU (miroir de `ProgressionLevelHero`, iOS) : « Niveau N » en grand, les étincelles
 * qui le portent, la barre vers le suivant et ce qui l'en sépare — ou l'échelle complète ([next] nul). Tout est lu sur
 * l'échelle servie : rien n'est recalculé ici.
 */
public data class ProgressionLevelHero(val level: Int, val score: Int, val progress: Double, val next: Next?) {
    /** « 50 étincelles jusqu'au niveau 3 » : ce qu'il reste, et le niveau qu'il ouvre. */
    public data class Next(val remaining: Int, val level: Int)

    public companion object {
        public fun of(level: EngagementLevelProgress): ProgressionLevelHero {
            val scale = level.scale
            val remaining = scale.remainingToNext
            return ProgressionLevelHero(
                level = level.level,
                score = scale.value,
                progress = scale.progress,
                next = if (scale.nextThreshold != null && remaining != null) Next(remaining, level.level + 1) else null,
            )
        }
    }
}

/** Ce que la tête de la Meesh propose sous sa barre : la frappe à son prix servi, ou ce qu'il manque et le plancher. */
public sealed interface MeeshAction {
    public data class Mint(val cost: Int) : MeeshAction

    public data class Missing(val missing: Int, val floor: Int) : MeeshAction
}

/**
 * LA TÊTE DE LA MEESH SANS BLOC DE JEU (miroir de `ProgressionMeeshDetail`, iOS) : le solde, les frappées depuis
 * toujours (rien quand aucune), les deux BORNES du registre de frappe — la dernière seulement quand elle diffère de la
 * première —, la barre vers la prochaine Meesh, puis la frappe au prix servi ou ce qu'il manque. Tout est servi par la
 * passerelle ; la frappe elle-même part par l'API, aucun débit n'est calculé ici.
 */
public data class ProgressionMeeshDetail(
    val balance: Int,
    val minted: Int?,
    /** ISO 8601 de la première frappe ; `null` : « Aucune frappe pour l'instant ». */
    val first: String?,
    /** ISO 8601 de la dernière, `null` quand elle est la première (une frappe unique ne se dit qu'une fois). */
    val last: String?,
    val progress: Double,
    val action: MeeshAction,
) {
    public companion object {
        public fun of(meesh: EngagementMeeshProgress): ProgressionMeeshDetail {
            val first = meesh.firstMintedAt
            return ProgressionMeeshDetail(
                balance = meesh.balance,
                minted = meesh.mintedLifetime.takeIf { it > 0 },
                first = first,
                last = meesh.lastMintedAt?.takeIf { first != null && !sameInstant(first, it) },
                progress = meesh.progress,
                action = if (meesh.canMint) MeeshAction.Mint(meesh.mintCost) else MeeshAction.Missing(meesh.missingPoints, meesh.floorPoints),
            )
        }

        /** Deux écritures d'un même instant (« …:00Z » et « …:00.000Z ») sont la même frappe. */
        private fun sameInstant(a: String, b: String): Boolean =
            runCatching { Instant.parse(a) == Instant.parse(b) }.getOrDefault(a == b)
    }
}
