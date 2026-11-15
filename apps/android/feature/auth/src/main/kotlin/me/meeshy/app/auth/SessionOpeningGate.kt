package me.meeshy.app.auth

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le point UNIQUE par lequel une session prouvée s'ouvre pendant que l'écran de connexion
 * présente une feuille d'accès (code, lien de connexion, inscription, mot de passe oublié) —
 * miroir de `SessionOpeningGate` (iOS).
 *
 * Ouvrir la session bascule la racine de l'app : ce que l'écran de connexion présente encore
 * resterait orphelin. La séquence est donc toujours : prouver, REFERMER, ouvrir.
 *
 * - une saisie qui se referme elle-même confie son ouverture par [openWhenDismissed] ;
 * - un lien reçu de l'EXTÉRIEUR, pendant n'importe quelle feuille, passe par [open], qui demande
 *   à l'hôte de la refermer ([dismissalRequested]).
 *
 * Dans les deux cas l'ouverture s'exécute dans [presentationEnded], appelé à la fermeture de la
 * feuille — une seule fois. Appelé depuis le fil principal.
 */
@Singleton
class SessionOpeningGate @Inject constructor() {

    private val _dismissalRequested = MutableStateFlow(false)

    /** L'hôte doit refermer sa feuille d'accès : une session attend. */
    val dismissalRequested: StateFlow<Boolean> = _dismissalRequested.asStateFlow()

    var isPresenting: Boolean = false
        private set

    private var pending: (() -> Unit)? = null

    /** Une feuille d'accès est affichée par l'écran de connexion. */
    fun presentationBegan() {
        isPresenting = true
    }

    /** Plus aucune feuille d'accès : l'ouverture en attente s'exécute. */
    fun presentationEnded() {
        isPresenting = false
        _dismissalRequested.value = false
        val opener = pending ?: return
        pending = null
        opener()
    }

    /** Ouvre dès qu'aucune feuille n'est affichée, en demandant à l'hôte de refermer celle qui l'est. */
    fun open(opener: () -> Unit) {
        if (!isPresenting) return opener()
        pending = opener
        _dismissalRequested.value = true
    }

    /** Ouvre quand la feuille, qui se referme d'elle-même, sera partie. */
    fun openWhenDismissed(opener: () -> Unit) {
        if (!isPresenting) return opener()
        pending = opener
    }
}
