package me.meeshy.sdk.model.reading.mode

import java.security.MessageDigest

/**
 * Loi PURE du cycle du chip — miroir de `ReadingModeCycle` (iOS) : le tap avance dans l'ordre,
 * boucle en fin de liste, repart au premier si le mode courant n'est pas listé, et rend `null`
 * (aucun effet) quand il n'y a rien vers quoi cycler.
 */
public object ReadingModeCycle {
    public fun next(
        current: ConversationReadingMode,
        availableInOrder: List<ConversationReadingMode>,
    ): ConversationReadingMode? {
        if (availableInOrder.size < 2) return null
        val index = availableInOrder.indexOf(current)
        if (index < 0) return availableInOrder.first()
        return availableInOrder[(index + 1) % availableInOrder.size]
    }
}

/** Pourquoi une ligne du menu est grisée — chaque forme a son propre texte. */
public sealed interface LensUnavailableReason {
    /** La Rivière en conversation directe : aucune porte, aucun nombre. */
    public data object RiverNever : LensUnavailableReason

    /** Compte d'actifs inconnu : le seuil seul. */
    public data class RiverThresholdOnly(val threshold: Int) : LensUnavailableReason

    /** Seuil et compte réels. */
    public data class RiverBelowThreshold(val threshold: Int, val current: Int) : LensUnavailableReason

    /** Hors catalogue de la loi (ex. Résumé pour un invité). */
    public data object Generic : LensUnavailableReason

    /** Permis par la loi mais pas encore rendu par cette application (port Android en cours). */
    public data object NotYetRendered : LensUnavailableReason
}

/** Une ligne du menu d'appui long du chip — miroir de `LensRowModel` (iOS). */
public data class LensRow(
    val mode: ConversationReadingMode,
    val isCurrent: Boolean,
    val isAvailable: Boolean,
    val unavailableReason: LensUnavailableReason?,
)

/**
 * Le catalogue du chip — miroir de `ReadingModeLensCatalog` (iOS), plus la borne Android des
 * modes déjà RENDUS ([delivered]) : une vue que l'écran ne sait pas encore dessiner reste listée
 * mais grisée, et n'entre pas dans le cycle.
 */
public object ReadingModeLensCatalog {

    /** Les trois vues du fil, puis Résumé et Rivière. */
    public val displayOrder: List<ConversationReadingMode> = listOf(
        ConversationReadingMode.FOCAL,
        ConversationReadingMode.SCRIPT,
        ConversationReadingMode.BUBBLES,
        ConversationReadingMode.SUMMARY,
        ConversationReadingMode.RIVER,
    )

    /** Les vues que le tap fait tourner. */
    public val cycleOrder: List<ConversationReadingMode> = listOf(
        ConversationReadingMode.FOCAL,
        ConversationReadingMode.SCRIPT,
        ConversationReadingMode.BUBBLES,
    )

    /** Le chip n'existe que drapeau ON, c.-à-d. dès qu'un mode autre que Bulles est au catalogue. */
    public fun showsChip(capabilities: ReadingModeCapabilities): Boolean =
        capabilities.availableModes.any { it != ConversationReadingMode.BUBBLES }

    /** Bulles est un choix de rendu hors loi : toujours permis drapeau ON. */
    public fun isLawAvailable(mode: ConversationReadingMode, capabilities: ReadingModeCapabilities): Boolean =
        mode == ConversationReadingMode.BUBBLES || mode in capabilities.availableModes

    /** L'ordre du cycle filtré : permis par la loi ET rendu ici. */
    public fun cycle(
        capabilities: ReadingModeCapabilities,
        delivered: Set<ConversationReadingMode>,
    ): List<ConversationReadingMode> =
        cycleOrder.filter { isLawAvailable(it, capabilities) && it in delivered }

    public fun rows(
        capabilities: ReadingModeCapabilities,
        currentMode: ConversationReadingMode,
        delivered: Set<ConversationReadingMode>,
    ): List<LensRow> = displayOrder.map { mode ->
        val lawAvailable = isLawAvailable(mode, capabilities)
        val reason = when {
            !lawAvailable && mode == ConversationReadingMode.RIVER -> riverReason(capabilities.riverEligibilityReason)
            !lawAvailable -> LensUnavailableReason.Generic
            mode !in delivered -> LensUnavailableReason.NotYetRendered
            else -> null
        }
        LensRow(mode = mode, isCurrent = mode == currentMode, isAvailable = reason == null, unavailableReason = reason)
    }

    private fun riverReason(reason: RiverEligibilityReason): LensUnavailableReason = when {
        reason.riverReason == RiverEligibilityReasonKind.NEVER_ELIGIBLE -> LensUnavailableReason.RiverNever
        reason.current == null -> LensUnavailableReason.RiverThresholdOnly(reason.threshold)
        else -> LensUnavailableReason.RiverBelowThreshold(reason.threshold, reason.current)
    }
}

/**
 * La décision d'OUVERTURE d'une conversation — miroir de `ReadingModeController.openingDecision`,
 * `renderDecision` et `landing` (iOS), suivi de la borne Android des modes rendus.
 */
public object ReadingModeOpening {

    /**
     * 1. La loi partagée ([ReadingModeOrchestrator.resolveOrchestratorDecision]).
     * 2. Règle de rendu iOS : drapeau coupé → Script (raison de la loi conservée) ; un choix
     *    collant Bulles est rendu Bulles (`sticky`) — la loi, elle, le rabat sur Script.
     * 3. [landsOnMessage] : une ouverture sur un message précis atterrit sur le fil — Résumé et
     *    Rivière s'ouvrent en Script, raison conservée.
     * 4. Borne Android : un mode pas encore rendu ([delivered]) retombe sur Script s'il est
     *    rendu, sinon sur Bulles ; un choix collant ainsi rabattu devient `clamped-unavailable`.
     */
    public fun decide(
        stickyMode: ConversationReadingMode?,
        unreadCount: Int,
        lastOpenedAtMs: Long?,
        nowMs: Long,
        capabilities: ReadingModeCapabilities,
        isFlagEnabled: Boolean,
        delivered: Set<ConversationReadingMode>,
        landsOnMessage: Boolean = false,
    ): OrchestratorDecision {
        val law = ReadingModeOrchestrator.resolveOrchestratorDecision(
            unreadCount = unreadCount,
            lastOpenedAtMs = lastOpenedAtMs,
            nowMs = nowMs,
            stickyChoice = ReadingModePreference.of(stickyMode),
            capabilities = capabilities,
            isFlagEnabled = isFlagEnabled,
        )
        val rendered = render(stickyMode, law, isFlagEnabled)
        val landed = if (landsOnMessage) landing(rendered) else rendered
        return deliver(landed, delivered)
    }

    public fun render(
        stickyMode: ConversationReadingMode?,
        law: OrchestratorDecision,
        isFlagEnabled: Boolean,
    ): OrchestratorDecision = when {
        !isFlagEnabled -> OrchestratorDecision(ConversationReadingMode.SCRIPT, law.reason)
        stickyMode == ConversationReadingMode.BUBBLES ->
            OrchestratorDecision(ConversationReadingMode.BUBBLES, OrchestratorDecisionReason.STICKY)
        else -> law
    }

    public fun landing(decision: OrchestratorDecision): OrchestratorDecision = when (decision.mode) {
        ConversationReadingMode.SUMMARY, ConversationReadingMode.RIVER ->
            OrchestratorDecision(ConversationReadingMode.SCRIPT, decision.reason)
        else -> decision
    }

    public fun deliver(decision: OrchestratorDecision, delivered: Set<ConversationReadingMode>): OrchestratorDecision {
        if (decision.mode in delivered) return decision
        val fallback = if (ReadingModeOrchestrator.CLAMP_FALLBACK_MODE in delivered) {
            ReadingModeOrchestrator.CLAMP_FALLBACK_MODE
        } else {
            ConversationReadingMode.BUBBLES
        }
        val reason = if (decision.reason == OrchestratorDecisionReason.STICKY) {
            OrchestratorDecisionReason.CLAMPED_UNAVAILABLE
        } else {
            decision.reason
        }
        return OrchestratorDecision(fallback, reason)
    }

    /** L'encoche « AUTO » : la décision vient de l'orchestrateur, pas d'un choix figé. */
    public fun isAuto(decision: OrchestratorDecision): Boolean =
        decision.reason != OrchestratorDecisionReason.STICKY &&
            decision.reason != OrchestratorDecisionReason.FLAG_DISABLED
}

/**
 * Composant de clé de stockage de la préférence — miroir de `ReadingModePreferenceScope` (iOS) :
 * `u_<userId>` pour un inscrit, `a_<16 premiers hex du SHA-256 du participantId>` pour un invité
 * (jamais l'identifiant brut au repos).
 */
public sealed interface ReadingModePreferenceScope {
    public val storageKey: String

    public data class Registered(val userId: String) : ReadingModePreferenceScope {
        override val storageKey: String get() = "u_$userId"
    }

    public data class Anonymous(val participantId: String) : ReadingModePreferenceScope {
        override val storageKey: String get() = "a_${truncatedSha256(participantId)}"
    }

    public companion object {
        public fun modeKey(scope: ReadingModePreferenceScope, conversationId: String): String =
            "meeshy_readmode_${scope.storageKey}_$conversationId"

        public fun lastOpenedKey(scope: ReadingModePreferenceScope, conversationId: String): String =
            "meeshy_lastopen_${scope.storageKey}_$conversationId"

        internal fun truncatedSha256(raw: String): String =
            MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
                .take(16)
    }
}
