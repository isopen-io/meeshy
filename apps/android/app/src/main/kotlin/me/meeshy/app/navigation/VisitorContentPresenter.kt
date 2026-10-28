package me.meeshy.app.navigation

import android.content.Intent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.visitor.VisitorContentRequest

/**
 * Quel lien d'une `Intent` ouvre l'ecran visiteur (iOS `VisitorContentPresenter.present`) : un lien VIEW de publication, de
 * reel ou de story, recu SANS session — ni compte, ni invite. Avec une session, le lien suit les `navDeepLink` du graphe.
 */
internal object VisitorLinkGate {
    private const val ACTION_VIEW = "android.intent.action.VIEW"

    fun divert(action: String?, dataString: String?, signedIn: Boolean): VisitorContentRequest? =
        if (action == ACTION_VIEW && !signedIn) VisitorContentRequest.fromUri(dataString) else null

    fun divert(intent: Intent, signedIn: Boolean): VisitorContentRequest? =
        divert(intent.action, intent.dataString, signedIn)
}

/**
 * **Le contenu d'un lien ouvert sans session, presente AU-DESSUS de l'ecran de connexion** (#9171). Le lien en attente
 * (`MainActivity.warmDeepLink`) n'est PAS consomme : la racine connectee le reprend apres la connexion, et le contenu
 * s'ouvre alors comme avant. Le visiteur voit seulement ce que le lien promettait en attendant.
 */
@Singleton
class VisitorContentPresenter @Inject constructor() {
    private val _request = MutableStateFlow<VisitorContentRequest?>(null)
    val request: StateFlow<VisitorContentRequest?> = _request.asStateFlow()

    fun present(request: VisitorContentRequest) {
        _request.value = request
    }

    fun dismiss() {
        _request.value = null
    }
}
