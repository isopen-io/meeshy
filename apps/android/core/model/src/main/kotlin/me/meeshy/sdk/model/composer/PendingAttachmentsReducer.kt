package me.meeshy.sdk.model.composer

/**
 * L'état pur du plateau. [departedIds] garde la mémoire des pièces parties (retirées ou
 * envoyées) : une préparation qui se termine après coup ne peut donc jamais les
 * ressusciter. [pendingPurge] liste les fichiers de travail que l'appelant doit supprimer.
 */
data class PendingAttachmentsState(
    val items: List<PendingAttachment> = emptyList(),
    val departedIds: Set<String> = emptySet(),
    val pendingPurge: List<String> = emptyList(),
) {
    val isEmpty: Boolean get() = items.isEmpty()
    val readyItems: List<PendingAttachment> get() = items.filter { it.isReady }
    val hasPreparing: Boolean get() = items.any { it.phase is PendingAttachmentPhase.Preparing }
}

enum class PendingAttachmentsOutcome {
    APPLIED,
    CAP_REACHED,
    DUPLICATE,
    IGNORED,
}

data class PendingAttachmentsReduction(
    val state: PendingAttachmentsState,
    val outcome: PendingAttachmentsOutcome,
) {
    val applied: Boolean get() = outcome == PendingAttachmentsOutcome.APPLIED
}

object PendingAttachmentsReducer {

    fun add(
        state: PendingAttachmentsState,
        item: PendingAttachment,
        limit: Int = ComposerAttachmentLimits.MAX_PENDING_ATTACHMENTS,
    ): PendingAttachmentsReduction {
        if (state.items.any { it.id == item.id }) return ignored(state)
        val storeId = item.mediaStoreId
        if (storeId != null && state.items.any { it.mediaStoreId == storeId }) {
            return PendingAttachmentsReduction(state, PendingAttachmentsOutcome.DUPLICATE)
        }
        if (state.items.size >= limit) {
            return PendingAttachmentsReduction(state, PendingAttachmentsOutcome.CAP_REACHED)
        }
        return applied(state.copy(items = state.items + item, departedIds = state.departedIds - item.id))
    }

    fun remove(state: PendingAttachmentsState, id: String): PendingAttachmentsReduction {
        val gone = state.items.firstOrNull { it.id == id } ?: return ignored(state)
        return applied(
            state.copy(
                items = state.items.filterNot { it.id == id },
                departedIds = state.departedIds + id,
                pendingPurge = state.pendingPurge + gone.ownedPaths,
            ),
        )
    }

    /** Remplace la pièce [id] sur place (position gardée), ignoré si elle est partie. */
    fun replace(
        state: PendingAttachmentsState,
        id: String,
        replacement: PendingAttachment,
    ): PendingAttachmentsReduction {
        val old = state.items.firstOrNull { it.id == id } ?: return ignored(state)
        val next = replacement.copy(id = id)
        val stale = old.ownedPaths.filterNot { it in next.ownedPaths }
        return applied(
            state.copy(
                items = state.items.map { if (it.id == id) next else it },
                pendingPurge = state.pendingPurge + stale,
            ),
        )
    }

    /** Fait avancer la préparation de [id] ; ignoré si la pièce est partie entre-temps. */
    fun update(
        state: PendingAttachmentsState,
        id: String,
        transform: (PendingAttachment) -> PendingAttachment,
    ): PendingAttachmentsReduction {
        if (state.items.none { it.id == id }) return ignored(state)
        return applied(
            state.copy(items = state.items.map { if (it.id == id) transform(it).copy(id = id) else it }),
        )
    }

    /** L'envoi consomme le plateau : tout part, les fichiers de travail sont à supprimer. */
    fun consume(state: PendingAttachmentsState): PendingAttachmentsState = state.copy(
        items = emptyList(),
        departedIds = state.departedIds + state.items.map { it.id },
        pendingPurge = state.pendingPurge + state.items.flatMap { it.ownedPaths },
    )

    fun drainPurge(state: PendingAttachmentsState): Pair<PendingAttachmentsState, List<String>> =
        state.copy(pendingPurge = emptyList()) to state.pendingPurge

    private fun applied(state: PendingAttachmentsState) =
        PendingAttachmentsReduction(state, PendingAttachmentsOutcome.APPLIED)

    private fun ignored(state: PendingAttachmentsState) =
        PendingAttachmentsReduction(state, PendingAttachmentsOutcome.IGNORED)
}
