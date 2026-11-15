package me.meeshy.core.database

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Santé du stockage local : [Normal], [Degraded] (base recréée ou repli disque), [Ephemeral] (mémoire : rien ne sera conservé). */
public sealed interface StorageState {
    public data object Normal : StorageState
    public data class Degraded(val reason: String) : StorageState
    public data class Ephemeral(val reason: String) : StorageState

    public val isEphemeral: Boolean get() = this is Ephemeral
}

/** Le magasin unique de l'état du stockage : le bandeau « Stockage indisponible » et l'écran Mode dégradé le projettent. */
@Singleton
public class StorageHealth @Inject constructor() {
    private val state = MutableStateFlow<StorageState>(StorageState.Normal)

    public val current: StateFlow<StorageState> = state.asStateFlow()

    public val isEphemeral: Boolean get() = state.value.isEphemeral

    public fun markNormal() {
        state.value = StorageState.Normal
    }

    /** Un repli disque ne dégrade jamais un stockage déjà éphémère. */
    public fun markDegraded(reason: String) {
        if (state.value.isEphemeral) return
        state.value = StorageState.Degraded(reason)
    }

    public fun markEphemeral(reason: String) {
        state.value = StorageState.Ephemeral(reason)
    }
}
