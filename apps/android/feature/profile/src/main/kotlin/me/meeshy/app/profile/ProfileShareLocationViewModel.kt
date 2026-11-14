package me.meeshy.app.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.relation.SharedLocationPrecision
import me.meeshy.sdk.model.relation.SharedLocationRoster
import me.meeshy.sdk.model.relation.SharedLocationShareDuration
import me.meeshy.sdk.relation.SharedLocationShareProblem
import me.meeshy.sdk.relation.SharedLocationSharing

/** Ce que la ligne « Partager ma position » d'une fiche peint. */
data class ProfileShareLocationState(
    /**
     * Ce que la personne voit de ma position et jusqu'à quand ; `null` : je ne la lui montre pas. Une échéance passée
     * reste là tant que le serveur ne l'a pas soldée : « Arrêter » ne disparaît jamais avant le partage.
     */
    val entry: SharedLocationRoster.Entry? = null,
    val isBusy: Boolean = false,
    /** Ce qui n'a pas abouti, dit une fois puis consommé. */
    val problem: SharedLocationShareProblem? = null,
)

/**
 * « Partager ma position » sur la fiche d'un Ami (#16985), iso `ProfileShareLocationRow.swift` (#16983). La ligne ne
 * paraît que dès Ami (`SharedLocationOfferRule`) ; la passerelle rejuge la loi à chaque envoi. Le partage lui-même vit
 * dans [SharedLocationSharing], un par compte : quitter la fiche ne l'arrête pas.
 */
@HiltViewModel
class ProfileShareLocationViewModel @Inject constructor(
    private val sharing: SharedLocationSharing,
) : ViewModel() {

    private val userId = MutableStateFlow<String?>(null)
    private val problem = MutableStateFlow<SharedLocationShareProblem?>(null)

    val state: StateFlow<ProfileShareLocationState> =
        combine(userId, sharing.roster, sharing.isBusy, problem) { id, roster, busy, notice ->
            ProfileShareLocationState(
                entry = id?.let { roster.entry(it) },
                isBusy = busy,
                problem = notice,
            )
        }.stateIn(viewModelScope, SharingStarted.Eagerly, ProfileShareLocationState())

    fun load(userId: String) {
        sharing.restore()
        this.userId.value = userId
    }

    /** Après le choix de la feuille : la permission a déjà été demandée par l'écran. */
    fun share(precision: SharedLocationPrecision, duration: SharedLocationShareDuration) {
        val id = userId.value ?: return
        viewModelScope.launch { problem.value = sharing.share(id, precision, duration) }
    }

    fun stop() {
        val id = userId.value ?: return
        viewModelScope.launch { problem.value = sharing.stopSharing(id) }
    }

    fun consumeProblem() {
        problem.value = null
    }
}
