package me.meeshy.sdk.model.reading.summary

import java.time.Instant
import me.meeshy.sdk.model.EphemeralLifecycle

/** Ce que le Résumé dit d'un message protégé : le motif, jamais le texte (#7452). */
sealed interface SummaryProtectionBadge {
    /** Éphémère encore vivant : [remainingSeconds] avant sa disparition ; `null` tant que rien ne le décompte. */
    data class Ephemeral(val remainingSeconds: Double?) : SummaryProtectionBadge
    data object ViewOnce : SummaryProtectionBadge
    data object Blurred : SummaryProtectionBadge
}

/** Un message protégé, tel que la loi le voit — instantané déjà résolu par l'appelant. */
data class SummaryProtectionFacts(
    val id: String,
    val senderDisplayName: String,
    val isViewOnce: Boolean,
    /** Ouvert par CE lecteur : une vue unique consommée a disparu pour lui. */
    val isViewOnceConsumed: Boolean,
    val isBlurred: Boolean,
    val isEphemeral: Boolean,
    val expiresAt: Instant?,
    val isDeleted: Boolean,
    val isSystem: Boolean,
)

data class SummaryProtectionEntry(
    val id: String,
    val senderDisplayName: String,
    val badges: List<SummaryProtectionBadge>,
)

/**
 * Les messages protégés ENCORE VIVANTS de la fenêtre, dans l'ordre du fil — miroir de
 * `LivingSummaryProtections.entries` (iOS). Deux règles tirent dans le même sens : aucun texte
 * dérivé ne garde le contenu d'un éphémère au-delà de son échéance (un échu n'y figure donc
 * plus), et un message qui figure porte son décompte (il existe : le masquer ferait mentir les
 * comptes du digest). Recomposée à chaque passe — jamais mémorisée dans le résumé.
 */
object SummaryProtections {
    fun entries(facts: List<SummaryProtectionFacts>, now: Instant): List<SummaryProtectionEntry> =
        facts.mapNotNull { fact ->
            if (fact.isDeleted || fact.isSystem) return@mapNotNull null
            val ephemeral = ephemeralBadge(fact, now)
            if (fact.isEphemeral && ephemeral == null && fact.expiresAt != null) return@mapNotNull null
            val badges = listOfNotNull(
                ephemeral,
                SummaryProtectionBadge.ViewOnce.takeIf { fact.isViewOnce && !fact.isViewOnceConsumed },
                SummaryProtectionBadge.Blurred.takeIf { fact.isBlurred },
            )
            if (badges.isEmpty()) {
                null
            } else {
                SummaryProtectionEntry(fact.id, fact.senderDisplayName, badges)
            }
        }

    private fun ephemeralBadge(fact: SummaryProtectionFacts, now: Instant): SummaryProtectionBadge.Ephemeral? {
        if (!fact.isEphemeral) return null
        return when (val state = EphemeralLifecycle.evaluate(fact.expiresAt, now)) {
            is EphemeralLifecycle.State.Running -> SummaryProtectionBadge.Ephemeral(state.remainingSeconds)
            EphemeralLifecycle.State.None -> SummaryProtectionBadge.Ephemeral(null)
            EphemeralLifecycle.State.Expired -> null
        }
    }
}
