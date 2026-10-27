package me.meeshy.app.chat.export

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import me.meeshy.sdk.session.SessionRepository

/** Qui exporte : le nom et le pseudo qui signent la carte et son filigrane. */
@HiltViewModel
class CardExportViewModel @Inject constructor(
    private val sessionRepository: SessionRepository,
) : ViewModel() {
    val viewer: CardViewer
        get() = sessionRepository.currentUser.value.let { me ->
            CardViewer(id = me?.id, displayName = me?.displayName, username = me?.username)
        }
}
