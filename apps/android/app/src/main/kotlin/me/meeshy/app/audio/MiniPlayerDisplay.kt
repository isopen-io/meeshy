package me.meeshy.app.audio

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Ce que le mini-lecteur AFFICHE, pas ce que le moteur joue (iOS `onDisplayedContextChange`, #6579).
 *
 * La barre se masque dans la conversation qui joue et se maintient pendant la grâce de la fin de file : deux règles que
 * seule [MiniPlayerViewModel] connaît. Il publie ici le résultat, et la bande de la barre d'état ([me.meeshy.app.overlay.TopChromeBandOverlay])
 * se peint exactement quand la barre occupe le sommet, sans réécrire ces règles ni observer un moteur qui publie à ~5 Hz.
 */
@Singleton
class MiniPlayerDisplay @Inject constructor() {
    private val mutableShown = MutableStateFlow(false)

    val shown: StateFlow<Boolean> = mutableShown.asStateFlow()

    fun publish(shown: Boolean) {
        mutableShown.value = shown
    }
}
