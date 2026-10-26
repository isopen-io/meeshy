package me.meeshy.sdk.model.reading.mode

/**
 * Le mode RENDU d'une conversation — miroir de `ConversationReadingMode`
 * (`packages/shared/types/reading-modes.ts`) et de `ReadingModeOrchestrator.ConversationReadingMode`
 * (iOS). [wire] est la valeur persistée, identique sur les trois plateformes.
 */
public enum class ConversationReadingMode(public val wire: String) {
    FOCAL("focal"),
    SCRIPT("script"),
    SUMMARY("summary"),
    RIVER("river"),
    BUBBLES("bubbles");

    public companion object {
        public fun fromWire(raw: String?): ConversationReadingMode? = entries.firstOrNull { it.wire == raw }
    }
}

/**
 * Ce que le lecteur a CHOISI (les mots du menu, la valeur du canal serveur) — miroir de
 * `ReadingModePreference`. [AUTO] rend la main aux branches numériques de la loi.
 * La table vers [ConversationReadingMode] est TOTALE (amendement S1 : `bulles` ↔ `bubbles`).
 */
public enum class ReadingModePreference(public val wire: String) {
    AUTO("auto"),
    FOCAL("focal"),
    SCRIPT("script"),
    RESUME("resume"),
    RIVIERE("riviere"),
    BULLES("bulles");

    /** Le mode rendu que cette préférence fige ; `null` pour [AUTO]. */
    public val stickyMode: ConversationReadingMode?
        get() = when (this) {
            AUTO -> null
            FOCAL -> ConversationReadingMode.FOCAL
            SCRIPT -> ConversationReadingMode.SCRIPT
            RESUME -> ConversationReadingMode.SUMMARY
            RIVIERE -> ConversationReadingMode.RIVER
            BULLES -> ConversationReadingMode.BUBBLES
        }

    public companion object {
        public fun fromWire(raw: String?): ReadingModePreference? = entries.firstOrNull { it.wire == raw }

        /** Réciproque de [stickyMode] : rien de mémorisé = [AUTO]. */
        public fun of(mode: ConversationReadingMode?): ReadingModePreference = when (mode) {
            null -> AUTO
            ConversationReadingMode.FOCAL -> FOCAL
            ConversationReadingMode.SCRIPT -> SCRIPT
            ConversationReadingMode.SUMMARY -> RESUME
            ConversationReadingMode.RIVER -> RIVIERE
            ConversationReadingMode.BUBBLES -> BULLES
        }
    }
}

/** Pourquoi l'orchestrateur a rendu sa décision — miroir de `OrchestratorDecisionReason`. */
public enum class OrchestratorDecisionReason(public val wire: String) {
    FLAG_DISABLED("flag-disabled"),
    STICKY("sticky"),
    UNREAD_OVER_CAP("unread-over-cap"),
    STALE_ABSENCE("stale-absence"),
    CLAMPED_UNAVAILABLE("clamped-unavailable"),
    DEFAULT("default");

    public companion object {
        public fun fromWire(raw: String?): OrchestratorDecisionReason? = entries.firstOrNull { it.wire == raw }
    }
}

public data class OrchestratorDecision(
    val mode: ConversationReadingMode,
    val reason: OrchestratorDecisionReason,
)

/** Type de conversation tel que la loi le connaît ; community/channel/bot sont repliés sur [GROUP]. */
public enum class ReadingModeConversationType(public val wire: String) {
    DIRECT("direct"),
    GROUP("group"),
    PUBLIC("public"),
    GLOBAL("global"),
    BROADCAST("broadcast");

    public companion object {
        /**
         * Miroir de `ConversationViewRules.readingModeConversationType` (iOS) : un type inconnu,
         * absent, `community`, `channel` ou `bot` se lit [GROUP]. Casse ignorée.
         */
        public fun of(raw: String?): ReadingModeConversationType = when (raw?.trim()?.lowercase()) {
            "direct" -> DIRECT
            "public" -> PUBLIC
            "global" -> GLOBAL
            "broadcast" -> BROADCAST
            else -> GROUP
        }
    }
}

/** POURQUOI la Rivière est fermée (ou ouverte) — trifurcation de l'amendement S1. */
public enum class RiverEligibilityReasonKind(public val wire: String) {
    NEVER_ELIGIBLE("neverEligible"),
    BELOW_THRESHOLD("belowThreshold"),
    ELIGIBLE("eligible"),
}

/** [current] `null` = compte d'actifs INCONNU, jamais « zéro ». */
public data class RiverEligibilityReason(
    val threshold: Int,
    val current: Int?,
    val riverReason: RiverEligibilityReasonKind,
)

public data class ReadingModeCapabilities(
    val availableModes: List<ConversationReadingMode>,
    val riverEligible: Boolean,
    val riverEligibilityReason: RiverEligibilityReason,
)

/**
 * Lois des modes de lecture — miroir EXACT de `packages/shared/utils/reading-modes.ts`
 * (C-011 `resolveOrchestratorDecision`, C-012 `resolveCapabilities`) et de
 * `ReadingModeOrchestrator.swift`. Pures : `now` est toujours injecté. Rejouées contre
 * `packages/shared/fixtures/reading-modes/{orchestrator,capabilities}.vectors.json`.
 */
public object ReadingModeOrchestrator {

    /** Seuil « > 25 non-lus » qui bascule en Résumé vivant. */
    public const val UNREAD_CAP: Int = 25

    /** Plancher de non-lus de la branche d'absence (« ≥ 10 »). */
    public const val ABSENCE_UNREAD_FLOOR: Int = 10

    /** Fenêtre d'absence du lecteur (« > 24 h »). */
    public const val ABSENCE_WINDOW_MS: Long = 24L * 60 * 60 * 1000

    /** Seuil de participants actifs à partir duquel la Rivière est éligible. */
    public const val RIVER_ELIGIBILITY_THRESHOLD: Int = 5

    /** Repli du clamp ET mode par défaut (directive porteur 2026-09-26, #8147). */
    public val CLAMP_FALLBACK_MODE: ConversationReadingMode = ConversationReadingMode.SCRIPT

    private val REGISTERED_AVAILABLE_MODES = listOf(
        ConversationReadingMode.FOCAL,
        ConversationReadingMode.SCRIPT,
        ConversationReadingMode.SUMMARY,
    )
    private val ANONYMOUS_AVAILABLE_MODES = listOf(ConversationReadingMode.FOCAL, ConversationReadingMode.SCRIPT)
    private val FLAG_DISABLED_AVAILABLE_MODES = listOf(ConversationReadingMode.BUBBLES)

    /**
     * Catalogue des modes sélectionnables + éligibilité Rivière (≥ 5 actifs, jamais en direct).
     * [activeParticipantCount] `null` = inconnu : jamais éligible, et le libellé se tait sur le compte.
     */
    public fun resolveCapabilities(
        isAnonymous: Boolean,
        isFlagEnabled: Boolean,
        isRiverFlagEnabled: Boolean,
        conversationType: ReadingModeConversationType,
        activeParticipantCount: Int?,
    ): ReadingModeCapabilities {
        val isNeverEligible = conversationType == ReadingModeConversationType.DIRECT
        val riverEligible = !isNeverEligible &&
            activeParticipantCount != null &&
            activeParticipantCount >= RIVER_ELIGIBILITY_THRESHOLD
        val riverReason = when {
            isNeverEligible -> RiverEligibilityReasonKind.NEVER_ELIGIBLE
            riverEligible -> RiverEligibilityReasonKind.ELIGIBLE
            else -> RiverEligibilityReasonKind.BELOW_THRESHOLD
        }
        val reason = RiverEligibilityReason(RIVER_ELIGIBILITY_THRESHOLD, activeParticipantCount, riverReason)
        if (!isFlagEnabled) {
            return ReadingModeCapabilities(FLAG_DISABLED_AVAILABLE_MODES, riverEligible, reason)
        }
        val base = if (isAnonymous) ANONYMOUS_AVAILABLE_MODES else REGISTERED_AVAILABLE_MODES
        val modes = if (isRiverFlagEnabled && riverEligible) base + ConversationReadingMode.RIVER else base
        return ReadingModeCapabilities(modes, riverEligible, reason)
    }

    /**
     * Priorité stricte : drapeau coupé → Bulles (non clampé) ; choix collant (clampé) ; > 25
     * non-lus → Résumé (clampé) ; ≥ 10 non-lus ET lecteur absent → Résumé (clampé) ; sinon
     * Script (non clampé). [lastOpenedAtMs] `null` = jamais ouverte = absent.
     */
    public fun resolveOrchestratorDecision(
        unreadCount: Int,
        lastOpenedAtMs: Long?,
        nowMs: Long,
        stickyChoice: ReadingModePreference,
        capabilities: ReadingModeCapabilities,
        isFlagEnabled: Boolean,
    ): OrchestratorDecision {
        if (!isFlagEnabled) {
            return OrchestratorDecision(ConversationReadingMode.BUBBLES, OrchestratorDecisionReason.FLAG_DISABLED)
        }
        val sticky = stickyChoice.stickyMode
        if (sticky != null) {
            return clamp(OrchestratorDecision(sticky, OrchestratorDecisionReason.STICKY), capabilities)
        }
        if (unreadCount > UNREAD_CAP) {
            return clamp(
                OrchestratorDecision(ConversationReadingMode.SUMMARY, OrchestratorDecisionReason.UNREAD_OVER_CAP),
                capabilities,
            )
        }
        val absent = lastOpenedAtMs == null || nowMs - lastOpenedAtMs > ABSENCE_WINDOW_MS
        if (unreadCount >= ABSENCE_UNREAD_FLOOR && absent) {
            return clamp(
                OrchestratorDecision(ConversationReadingMode.SUMMARY, OrchestratorDecisionReason.STALE_ABSENCE),
                capabilities,
            )
        }
        return OrchestratorDecision(CLAMP_FALLBACK_MODE, OrchestratorDecisionReason.DEFAULT)
    }

    /** Projection vers `ConversationBridge.suggestedMode` : seul le Résumé se projette en `resume`. */
    public fun toBridgeSuggestedMode(decision: OrchestratorDecision): String =
        if (decision.mode == ConversationReadingMode.SUMMARY) "resume" else "focal"

    private fun clamp(decision: OrchestratorDecision, capabilities: ReadingModeCapabilities): OrchestratorDecision =
        if (decision.mode in capabilities.availableModes) {
            decision
        } else {
            OrchestratorDecision(CLAMP_FALLBACK_MODE, OrchestratorDecisionReason.CLAMPED_UNAVAILABLE)
        }
}
