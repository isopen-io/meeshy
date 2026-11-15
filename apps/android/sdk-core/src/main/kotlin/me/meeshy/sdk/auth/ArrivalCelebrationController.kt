package me.meeshy.sdk.auth

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.session.PerAccountCache

/**
 * Ce que les portes d'accès appellent quand la preuve de l'adresse vient d'ouvrir la session (miroir de
 * `ArrivalCelebrating`, iOS) : le lien de vérification ou le code saisi.
 */
interface ArrivalCelebrating {
    /** La fête ET le préchargement. */
    fun begin(userId: String)

    /** Le préchargement SEUL : la carte de l'inscription a déjà joué son feu d'artifice. */
    fun prepare(userId: String)
}

/**
 * La célébration de l'arrivée (miroir de `ArrivalCelebrationController`, iOS) : la session ouverte, un feu
 * d'artifice précède l'onboarding pendant que les caches se remplissent.
 *
 * Le préchargement appartient à ce contrôleur, jamais à un écran : ni la fin de la fête ni un écran qui se
 * démonte ne l'annulent. Il n'a lieu qu'UNE fois par utilisateur : un second lien, ou le code tapé après le
 * lien, ne relance ni la fête ni le réseau. [clear] (déconnexion ou changement de compte) arrête la fête,
 * annule le préchargement en vol et oublie les utilisateurs déjà préchargés.
 */
class ArrivalCelebrationController(
    private val preload: ArrivalPreloading,
    private val scope: CoroutineScope,
    private val hold: suspend () -> Unit = { delay(HOLD_MS) },
) : ArrivalCelebrating, PerAccountCache {
    private val lock = Any()
    private val _isShowing = MutableStateFlow(false)
    val isShowing: StateFlow<Boolean> = _isShowing.asStateFlow()

    private val preloadedUserIds = mutableSetOf<String>()
    private var preloadJob: Job? = null
    private var holdJob: Job? = null

    override fun begin(userId: String) {
        startPreload(userId)
        synchronized(lock) {
            if (_isShowing.value) return
            _isShowing.value = true
            holdJob = scope.launch {
                hold()
                synchronized(lock) { _isShowing.value = false; holdJob = null }
            }
        }
    }

    override fun prepare(userId: String) = startPreload(userId)

    /** Toucher l'écran ou « Continuer » passe la fête ; le préchargement, lui, continue. */
    fun dismiss() {
        synchronized(lock) {
            holdJob?.cancel()
            holdJob = null
            _isShowing.value = false
        }
    }

    override suspend fun clear() = resetForLogout()

    fun resetForLogout() {
        synchronized(lock) {
            holdJob?.cancel()
            holdJob = null
            _isShowing.value = false
            preloadJob?.cancel()
            preloadJob = null
            preloadedUserIds.clear()
        }
    }

    private fun startPreload(userId: String) {
        synchronized(lock) {
            if (!preloadedUserIds.add(userId)) return
            preloadJob = scope.launch { preload.run() }
        }
    }

    companion object {
        /** Le temps de la fête : assez pour la voir, trop court pour l'attendre. */
        const val HOLD_MS: Long = 2_600L
    }
}
