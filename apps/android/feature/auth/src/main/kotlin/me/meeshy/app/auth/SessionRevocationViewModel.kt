package me.meeshy.app.auth

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.model.auth.SessionRevocationNotice
import me.meeshy.sdk.session.SessionRevocationCenter

/** L'avis de fermeture de session à montrer à la racine, et le signal de fermer la session qui l'accompagne. */
@HiltViewModel
class SessionRevocationViewModel @Inject constructor(
    private val center: SessionRevocationCenter,
) : ViewModel() {
    val notice: StateFlow<SessionRevocationNotice?> = center.notice
    val closures: Flow<SessionRevocationNotice> = center.closures

    /** « Se reconnecter » : l'avis [id] est acquitté. */
    fun acknowledge(id: String) = center.acknowledge(id)
}
