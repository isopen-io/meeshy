package me.meeshy.app.chat

import me.meeshy.sdk.model.reading.mode.ConversationReadingMode

/**
 * La veille de la liste sous un panneau opaque (iOS `rendersThread`, `applyToDataSource`,
 * `MessageListView+CoveredUpdate`). Les flux continuent ; seul l'application de l'état est
 * neutralisée, par le [ChatListUpdateGate], puis l'état courant est rejoué au réveil.
 */
internal object ChatListQuiescence {

    /** Le fil est-il VISIBLE ? Le Résumé et la Rivière l'ouvrent sous un panneau opaque. */
    fun rendersThread(mode: ConversationReadingMode?, riverOpen: Boolean = false): Boolean = when (mode) {
        ConversationReadingMode.SUMMARY -> false
        ConversationReadingMode.RIVER -> !riverOpen
        else -> true
    }

    /** Sous couverture, deux passes successives sont la même liste tant que rien d'utile ne change. */
    fun skipsUpdate(old: CoveredListInputs, new: CoveredListInputs): Boolean =
        old.covered && new.covered && old == new
}

/**
 * Les valeurs qui comptent pour une liste couverte (iOS `CoveredInputs`) : le mode, le compte,
 * l'accent, les encarts, les ordres de défilement, la sélection. Les closures n'y figurent
 * pas — elles ne lisent que des boîtes d'état partagées et le réveil les remplace.
 */
internal data class CoveredListInputs(
    val covered: Boolean,
    val mode: ChatReadingMode = ChatReadingMode.Default,
    val currentUserId: String? = null,
    val accentHex: String? = null,
    val topInsetPx: Int = 0,
    val bottomInsetPx: Int = 0,
    val scrollToBottomTrigger: Int = 0,
    val scrollToMessageId: String? = null,
    val selectedMessageIds: Set<String> = emptySet(),
)

/** Garde la dernière valeur appliquée et refuse les passes inutiles sous couverture. */
internal class CoveredUpdateFilter {
    private var applied: CoveredListInputs? = null

    /** `true` si la passe doit s'appliquer ; la première et toute valeur utile passent. */
    fun accept(inputs: CoveredListInputs): Boolean {
        val previous = applied
        if (previous != null && ChatListQuiescence.skipsUpdate(previous, inputs)) return false
        applied = inputs
        return true
    }
}
