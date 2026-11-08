package me.meeshy.app.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.net.SessionRefusalNotifier
import me.meeshy.sdk.session.SessionRefusalCenter

/** L'écran de refus qui couvre l'app. */
enum class SessionRefusalScreen {
    /** Le compte de la session a été supprimé ailleurs. */
    SESSION_CLOSED,

    /** Un compte de moins de 13 ans. */
    AGE_BELOW_MINIMUM,
}

/**
 * Quel écran de refus couvre l'app (iOS `AgeGateController` + retrait d'un compte supprimé). La session fermée prime sur
 * l'âge : le compte n'existe plus, l'âge n'a plus rien à dire. Les deux écrans ont UNE sortie, sans retour.
 */
@HiltViewModel
class SessionRefusalViewModel internal constructor(
    closed: StateFlow<Boolean>,
    ageRefused: StateFlow<Boolean>,
    private val onClosedAcknowledged: () -> Unit,
    private val onAgeAcknowledged: () -> Unit,
    private val hasAccountSession: () -> Boolean,
) : ViewModel() {

    @Inject
    constructor(
        center: SessionRefusalCenter,
        notifier: SessionRefusalNotifier,
        authRepository: AuthRepository,
    ) : this(
        closed = center.closed,
        ageRefused = notifier.ageRefused,
        onClosedAcknowledged = center::acknowledgeClosed,
        onAgeAcknowledged = notifier::acknowledgeAgeRefusal,
        hasAccountSession = { authRepository.hasAccountSession },
    )

    val screen: StateFlow<SessionRefusalScreen?> = combine(closed, ageRefused, ::screenOf)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS), screenOf(closed.value, ageRefused.value))

    /** « Se reconnecter » : l'écran se retire (l'appareil est déjà purgé). */
    fun acknowledgeClosed() = onClosedAcknowledged()

    /** « J'ai compris » : l'écran se retire. Rend `true` quand une session de compte est encore ouverte et doit se fermer. */
    fun acknowledgeAge(): Boolean {
        val mustSignOut = hasAccountSession()
        onAgeAcknowledged()
        return mustSignOut
    }

    private companion object {
        const val STOP_TIMEOUT_MILLIS = 5_000L

        fun screenOf(closed: Boolean, ageRefused: Boolean): SessionRefusalScreen? = when {
            closed -> SessionRefusalScreen.SESSION_CLOSED
            ageRefused -> SessionRefusalScreen.AGE_BELOW_MINIMUM
            else -> null
        }
    }
}
