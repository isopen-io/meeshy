package me.meeshy.sdk.model.reading.mode

/** Un choix du menu de mode : Automatique, ou un mode figé. */
public sealed interface ReadingModeChoice {
    public data object Auto : ReadingModeChoice
    public data class Mode(val mode: ConversationReadingMode) : ReadingModeChoice
}

/**
 * Une entrée du menu de mode — miroir de `LentilleModeMenuModel.Entry` (iOS) : [isSelected] est la
 * coche, [isDisabled] une entrée grisée mais JAMAIS retirée, [reason] sa raison vivante.
 */
public data class ReadingModeMenuEntry(
    val choice: ReadingModeChoice,
    val isSelected: Boolean,
    val isDisabled: Boolean,
    val reason: LensUnavailableReason?,
)

/**
 * Le menu de mode, UN catalogue pour ses trois portes (puce du fil, feuille Lens, sous-menu de la
 * liste) — miroir de `LentilleModeMenuModel.build` (iOS). Ordre : Automatique, Focal, Script,
 * Bulles, Résumé, Rivière. Pur : l'éligibilité vient de [ReadingModeLensCatalog], jamais d'une
 * seconde loi.
 */
public object ReadingModeMenuModel {

    /** Toutes les vues sont rendues par le fil. */
    public val DELIVERED: Set<ConversationReadingMode> = ConversationReadingMode.entries.toSet()

    /** `null` = Automatique ; un choix collant n'est une préférence que si la décision en vient. */
    public fun preferenceOf(decision: OrchestratorDecision): ConversationReadingMode? =
        if (ReadingModeOpening.isAuto(decision)) null else decision.mode

    public fun build(
        capabilities: ReadingModeCapabilities,
        preference: ConversationReadingMode?,
        delivered: Set<ConversationReadingMode> = DELIVERED,
    ): List<ReadingModeMenuEntry> {
        val rows = ReadingModeLensCatalog.rows(capabilities, preference ?: ConversationReadingMode.BUBBLES, delivered)
            .associateBy { it.mode }
        val auto = ReadingModeMenuEntry(ReadingModeChoice.Auto, isSelected = preference == null, isDisabled = false, reason = null)
        val modes = ReadingModeLensCatalog.displayOrder.map { mode ->
            val row = rows.getValue(mode)
            ReadingModeMenuEntry(
                choice = ReadingModeChoice.Mode(mode),
                isSelected = preference == mode,
                isDisabled = !row.isAvailable,
                reason = row.unavailableReason,
            )
        }
        return listOf(auto) + modes
    }

    /** Le menu d'une conversation de la liste, capacités résolues depuis son type et sa taille. */
    public fun forConversation(
        conversationType: String?,
        memberCount: Int?,
        isAnonymous: Boolean,
        isFlagEnabled: Boolean,
        isRiverFlagEnabled: Boolean,
        preference: ConversationReadingMode?,
        delivered: Set<ConversationReadingMode> = DELIVERED,
    ): List<ReadingModeMenuEntry> = build(
        capabilities = ReadingModeOrchestrator.resolveCapabilities(
            isAnonymous = isAnonymous,
            isFlagEnabled = isFlagEnabled,
            isRiverFlagEnabled = isRiverFlagEnabled,
            conversationType = ReadingModeConversationType.of(conversationType),
            activeParticipantCount = memberCount,
        ),
        preference = preference,
        delivered = delivered,
    )
}
