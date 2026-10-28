package me.meeshy.app.auth.visitor

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.analytics.ContentSurface
import me.meeshy.sdk.model.analytics.ImpressionSource
import me.meeshy.sdk.model.analytics.SocialEvent
import me.meeshy.sdk.model.visitor.VisitorContentRequest
import me.meeshy.sdk.model.visitor.VisitorContentState
import me.meeshy.sdk.post.VisitorReachReporter
import me.meeshy.sdk.visitor.VisitorContentLoader

/**
 * L'ecran visiteur (iOS `VisitorContentView` + `VisitorContentReach`) : charge le contenu public d'un lien ouvert sans
 * compte et compte ce qu'il montre — impression et vue des que le contenu est servi, vue avec sa duree a la sortie.
 * Le Prisme se descend a l'affichage, a la locale de l'appareil.
 */
@HiltViewModel
class VisitorContentViewModel @Inject constructor(
    private val loader: VisitorContentLoader,
    private val reach: VisitorReachReporter,
) : ViewModel() {
    private val _state = MutableStateFlow<VisitorContentState>(VisitorContentState.Pending)
    val state: StateFlow<VisitorContentState> = _state.asStateFlow()

    private var request: VisitorContentRequest? = null
    private var job: Job? = null
    private var shownAtMs: Long? = null

    /** La locale de l'appareil, seul rang du Prisme d'un lecteur sans compte. */
    val deviceLocale: String get() = Locale.getDefault().toLanguageTag()

    /** Idempotent par demande : recomposer ou tourner l'ecran ne recharge pas, ne recompte pas. */
    fun start(request: VisitorContentRequest) {
        if (this.request?.id == request.id) return
        leave()
        this.request = request
        load(request)
    }

    fun retry() {
        request?.let(::load)
    }

    private fun load(request: VisitorContentRequest) {
        job?.cancel()
        _state.value = VisitorContentState.Pending
        job = viewModelScope.launch {
            val loaded = loader.load(request)
            _state.value = loaded
            if (loaded is VisitorContentState.Served) {
                shownAtMs = System.currentTimeMillis()
                reach.record(
                    listOf(
                        SocialEvent.Impression(request.postId, ImpressionSource.SHARED_LINK.wire, ContentSurface.VISITOR),
                        SocialEvent.View(request.postId, surface = ContentSurface.VISITOR),
                    ),
                )
            }
        }
    }

    private fun leave() {
        val postId = request?.postId
        val shown = shownAtMs
        shownAtMs = null
        if (postId == null || shown == null) return
        val duration = (System.currentTimeMillis() - shown).coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()
        reach.record(listOf(SocialEvent.View(postId, durationMs = duration, surface = ContentSurface.VISITOR)))
    }

    override fun onCleared() {
        leave()
        super.onCleared()
    }
}
