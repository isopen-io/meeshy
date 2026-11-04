package me.meeshy.app.auth

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.model.auth.SessionRevocationNotice
import me.meeshy.sdk.session.SessionRevocationCenter

/**
 * L'avis de fermeture de session à montrer à la racine, et l'identifiant de la dernière fermeture déjà appliquée par le
 * SDK : la racine aligne son état dessus en le RELISANT, aucun signal ne se perd quand aucun écran n'écoute.
 */
@HiltViewModel
class SessionRevocationViewModel @Inject constructor(
    private val center: SessionRevocationCenter,
) : ViewModel() {
    val notice: StateFlow<SessionRevocationNotice?> = center.notice
    val closed: StateFlow<String?> = center.closed

    /** « Se reconnecter » : l'avis [id] est acquitté. */
    fun acknowledge(id: String) = center.acknowledge(id)
}
