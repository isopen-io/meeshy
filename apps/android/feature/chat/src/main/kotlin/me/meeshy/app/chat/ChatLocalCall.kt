package me.meeshy.app.chat

import androidx.compose.runtime.Immutable
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import me.meeshy.sdk.model.call.CallHeaderSnapshot

/**
 * Ce que l'en-tête sait de l'appel LOCAL de cet appareil (miroir de `CallHeaderSnapshotStore`, iOS) :
 * le [snapshot] à deux faits, la durée vivante [duration] — lue par la seule pastille, jamais par
 * l'écran — et le retour [onReturn] vers l'écran d'appel déjà ouvert. Fourni par l'application,
 * car une feature ne connaît pas la pile d'appel.
 */
@Immutable
class ChatLocalCall(
    val snapshot: CallHeaderSnapshot,
    val duration: Flow<String?>,
    val onReturn: () -> Unit,
) {
    companion object {
        val NONE = ChatLocalCall(CallHeaderSnapshot.IDLE, emptyFlow()) {}
    }
}
