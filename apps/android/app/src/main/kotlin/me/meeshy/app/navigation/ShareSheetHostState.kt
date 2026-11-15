package me.meeshy.app.navigation

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.share.ShareSubject

/** Le contenu en attente de la feuille de partage et ce qu'il faut dire à la porte qui l'a posé quand elle se ferme. */
data class PendingShare(val subject: ShareSubject, val onDismissed: () -> Unit)

/**
 * **L'état UNIQUE de la feuille de partage de la racine** (pendant de `router.pendingShareContent` iOS) : une
 * seule feuille à la fois, pilotée par le contenu à partager. Poser le même contenu deux fois n'ouvre pas
 * deux feuilles ; poser un autre contenu REMPLACE le premier, dont la porte est avertie de la fermeture.
 * Toute porte (y compris le relais d'une extension de partage) passe par [present].
 */
@Singleton
class ShareSheetHostState @Inject constructor() {
    private val mutablePending = MutableStateFlow<PendingShare?>(null)
    val pending: StateFlow<PendingShare?> = mutablePending.asStateFlow()

    fun present(subject: ShareSubject, onDismissed: () -> Unit = {}) {
        val previous = mutablePending.value
        if (previous?.subject == subject) return
        mutablePending.value = PendingShare(subject, onDismissed)
        previous?.onDismissed?.invoke()
    }

    /** Ferme la feuille et avertit la porte, une seule fois. */
    fun dismiss() {
        val closed = mutablePending.value ?: return
        mutablePending.value = null
        closed.onDismissed()
    }
}

/** Porte l'état unique de la feuille de partage jusqu'à l'arbre Compose de la racine. */
@dagger.hilt.android.lifecycle.HiltViewModel
class ShareSheetHostViewModel @Inject constructor(val state: ShareSheetHostState) : androidx.lifecycle.ViewModel()
