package me.meeshy.sdk.model.reading

/** Pourquoi l'orchestrateur a rendu cette décision — libellé de l'encoche « AUTO · <raison> ». */
enum class OrchestratorDecisionReason(val wire: String) {
    FLAG_DISABLED("flag-disabled"),
    STICKY("sticky"),
    UNREAD_OVER_CAP("unread-over-cap"),
    STALE_ABSENCE("stale-absence"),
    CLAMPED_UNAVAILABLE("clamped-unavailable"),
    DEFAULT("default"),
    ;

    companion object {
        fun fromWire(value: String?): OrchestratorDecisionReason? = entries.firstOrNull { it.wire == value }
    }
}

data class OrchestratorDecision(
    val mode: ConversationReadingMode,
    val reason: OrchestratorDecisionReason,
)

/**
 * Les entrées de la décision. Les horloges sont des millisecondes epoch INJECTÉES : la loi ne lit
 * jamais l'heure. [lastOpenedAtMs] `null` = jamais ouverte.
 */
data class OrchestratorDecisionInput(
    val unreadCount: Int,
    val lastOpenedAtMs: Long?,
    val nowMs: Long,
    val stickyChoice: ReadingModePreference,
    /** Le catalogue BORNE la décision, drapeau allumé : la loi ne rend jamais un mode que l'écran ne sait pas ouvrir. */
    val capabilities: ReadingModeCapabilities,
    val isFlagEnabled: Boolean,
)

/** Les deux seules images du pont ✦ (`ConversationBridge.suggestedMode`). */
enum class BridgeSuggestedMode(val wire: String) {
    FOCAL("focal"),
    RESUME("resume"),
}

/**
 * Orchestrateur des modes de lecture — miroir de `resolveOrchestratorDecision`
 * (`packages/shared/utils/reading-modes.ts`, qui fait foi ; iOS : `ReadingModeOrchestrator`).
 *
 * Priorité stricte :
 * 1. drapeau éteint ⇒ `bubbles` / `flag-disabled`, NON clampé (le catalogue drapeau éteint EST `[bubbles]`) ;
 * 2. un choix collant gagne toujours, mais il est CLAMPÉ au catalogue ;
 * 3. plus de [UNREAD_CAP] non-lus ⇒ `summary`, clampé ;
 * 4. au moins [ABSENCE_UNREAD_FLOOR] non-lus ET absence de plus de 24 h (ou jamais ouverte) ⇒ `summary`, clampé ;
 * 5. sinon `script` / `default`.
 *
 * Hors catalogue ⇒ repli `script` avec la raison `clamped-unavailable` : le mode n'a pas été choisi,
 * il a été rabattu. Un invité à 26 non-lus n'obtient donc jamais un Résumé qui s'ouvrirait sur un 403.
 */
object ReadingModeOrchestrator {
    /** Seuil « > 25 non-lus » qui bascule en Résumé Vivant. */
    const val UNREAD_CAP: Int = 25

    /** Plancher de non-lus de la branche d'absence (« ≥ 10 »). */
    const val ABSENCE_UNREAD_FLOOR: Int = 10

    /** Fenêtre d'absence du lecteur (« > 24 h »), en millisecondes. */
    const val ABSENCE_WINDOW_MS: Long = 24L * 60 * 60 * 1000

    /** Repli du clamp ET mode par défaut. */
    val CLAMP_FALLBACK_MODE: ConversationReadingMode = ConversationReadingMode.SCRIPT

    fun resolveOrchestratorDecision(input: OrchestratorDecisionInput): OrchestratorDecision {
        if (!input.isFlagEnabled) {
            return OrchestratorDecision(ConversationReadingMode.BUBBLES, OrchestratorDecisionReason.FLAG_DISABLED)
        }
        fun clamp(decision: OrchestratorDecision) = clampToCapabilities(decision, input.capabilities)

        ReadingModePreferenceMapping.storedMode(input.stickyChoice)?.let { sticky ->
            return clamp(OrchestratorDecision(sticky, OrchestratorDecisionReason.STICKY))
        }
        if (input.unreadCount > UNREAD_CAP) {
            return clamp(OrchestratorDecision(ConversationReadingMode.SUMMARY, OrchestratorDecisionReason.UNREAD_OVER_CAP))
        }
        if (input.unreadCount >= ABSENCE_UNREAD_FLOOR && isReaderAbsent(input.lastOpenedAtMs, input.nowMs)) {
            return clamp(OrchestratorDecision(ConversationReadingMode.SUMMARY, OrchestratorDecisionReason.STALE_ABSENCE))
        }
        return OrchestratorDecision(CLAMP_FALLBACK_MODE, OrchestratorDecisionReason.DEFAULT)
    }

    /**
     * Projection TOTALE de la décision vers `ConversationBridge.suggestedMode` : seul `summary` se
     * projette en `resume` ; tout autre mode ouvre le fil, donc `focal`. Le motif n'entre pas.
     */
    fun toBridgeSuggestedMode(decision: OrchestratorDecision): BridgeSuggestedMode =
        if (decision.mode == ConversationReadingMode.SUMMARY) BridgeSuggestedMode.RESUME else BridgeSuggestedMode.FOCAL

    private fun clampToCapabilities(
        decision: OrchestratorDecision,
        capabilities: ReadingModeCapabilities,
    ): OrchestratorDecision =
        if (decision.mode in capabilities.availableModes) {
            decision
        } else {
            OrchestratorDecision(CLAMP_FALLBACK_MODE, OrchestratorDecisionReason.CLAMPED_UNAVAILABLE)
        }

    private fun isReaderAbsent(lastOpenedAtMs: Long?, nowMs: Long): Boolean =
        lastOpenedAtMs == null || nowMs - lastOpenedAtMs > ABSENCE_WINDOW_MS
}
