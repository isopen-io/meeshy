package me.meeshy.sdk.conversation

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * « L'application revient au premier plan » : émis par la coque (`ProcessLifecycleOwner`
 * ON_START), lu par les écrans qui rejouent un travail à ce moment-là (préchargement des
 * messages de la liste). Les features ne dépendent pas de `lifecycle-process`.
 */
@Singleton
class AppForegroundSignal @Inject constructor() {
    private val mutableEntered = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val entered: SharedFlow<Unit> = mutableEntered.asSharedFlow()

    fun notifyEntered() {
        mutableEntered.tryEmit(Unit)
    }
}
