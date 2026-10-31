package me.meeshy.app.game.progression

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.sdk.game.GameDevicePrefsStore
import me.meeshy.sdk.game.GameGuideRepository
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.guide.GameGuideSession
import me.meeshy.sdk.model.game.guide.GuideCard

/**
 * LE GUIDE DE LA PREMIÈRE PAGE (iOS `ProgressionViewModel.guide`, `GameGuideSession`) — la session vit tant que la
 * page vit : une carte par ouverture, vue dès qu'elle s'affiche (envoyée au serveur), « Plus tard » et « Passer
 * l'intégration » selon la loi. La page lui passe chaque lecture du bloc de jeu. Comme sur iOS, la ligne se tait quand
 * l'utilisateur a coupé les célébrations : la session continue, seule la ligne disparaît.
 */
@HiltViewModel
class ProgressionGuideViewModel @Inject constructor(
    private val guide: GameGuideRepository,
    prefs: GameDevicePrefsStore,
) : ViewModel() {

    private val card = MutableStateFlow<GuideCard?>(null)
    val state: StateFlow<GuideCard?> = combine(card, prefs.prefs) { shown, device -> shown.takeIf { device.celebrations } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    private val session = GameGuideSession(
        visits = guide,
        memory = guide,
        today = { LocalDate.now().toString() },
        markSeen = { keys -> viewModelScope.launch { guide.markSeen(keys) } },
    )

    fun observe(game: GameBlock) {
        session.observe(game)
        card.value = session.card
    }

    fun dismiss() {
        session.dismiss()
        card.value = session.card
    }

    fun skipAll() {
        session.skipAll()
        card.value = session.card
    }
}
