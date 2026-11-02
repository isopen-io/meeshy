package me.meeshy.sdk.game

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * « Le calque d'accueil est-il à l'écran ? » (miroir d'`OnboardingPresenceSignal`, iOS #7914) — publié par l'hôte de
 * l'onboarding, lu par ceux qui ne doivent pas le recouvrir : la célébration d'un palier. Un SIGNAL, pas le modèle :
 * ceux qui l'écoutent n'ont rien à savoir du parcours.
 */
@Singleton
class OnboardingPresence @Inject constructor() {
    private val presented = MutableStateFlow(false)
    val isPresented: StateFlow<Boolean> = presented.asStateFlow()

    fun update(isPresented: Boolean) {
        presented.value = isPresented
    }
}

/**
 * « Un événement du jeu occupe-t-il l'écran ? » (miroir de `GameMomentPresence`, iOS #9821) — publié par l'hôte de la
 * célébration, lu par ceux qu'il recouvre : une story se FIGE dessous, car une fenêtre qui recouvre un écran ne le lui
 * dit pas.
 */
@Singleton
class GameMomentPresence @Inject constructor() {
    private val presented = MutableStateFlow(false)
    val isPresented: StateFlow<Boolean> = presented.asStateFlow()

    fun update(isPresented: Boolean) {
        presented.value = isPresented
    }
}
