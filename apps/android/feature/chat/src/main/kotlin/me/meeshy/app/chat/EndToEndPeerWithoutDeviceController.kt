package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.launch
import me.meeshy.sdk.e2ee.libsignal.EndToEndPeerDeviceReach
import me.meeshy.sdk.e2ee.libsignal.EndToEndReadableRedirect
import me.meeshy.sdk.model.e2ee.EndToEndPeerWithoutDeviceBannerRule
import me.meeshy.sdk.model.e2ee.PeerFirstName

/** Le bandeau au-dessus du compositeur : le prénom du pair (vide : la phrase sans nom), et l'ouverture en cours. */
data class PeerWithoutDeviceBanner(val peerFirstName: String, val isOpening: Boolean)

/** Ce que « Écrire sans chiffrement » dit quand le tête-à-tête lisible ne s'ouvre pas. */
enum class PeerWithoutDeviceNotice { OFFLINE, OPEN_FAILED }

/**
 * #20076 (miroir d'iOS `EndToEndPeerWithoutDeviceBannerHost`) — dans un tête-à-tête chiffré de bout en bout dont le pair
 * est CONNU sans appareil chiffré, le bandeau le dit et « Écrire sans chiffrement » ouvre le tête-à-tête lisible de la
 * paire. La liste des appareils du pair se relit en silence à l'ouverture (cache-first : aucun indicateur d'attente), et
 * un envoi de CE fil redirigé vers le lisible ([EndToEndReadableRedirect.redirected]) l'ouvre aussi.
 */
class EndToEndPeerWithoutDeviceController @Inject constructor(
    private val reach: EndToEndPeerDeviceReach,
    private val redirect: EndToEndReadableRedirect,
) : ChatController {

    private data class PeerFacts(val sealsEndToEnd: Boolean, val isDirect: Boolean, val peerUserId: String?, val peerName: String?)

    private val opening = MutableStateFlow(false)
    private val _banner = MutableStateFlow<PeerWithoutDeviceBanner?>(null)
    val banner: StateFlow<PeerWithoutDeviceBanner?> = _banner.asStateFlow()

    private val _openRequests = MutableSharedFlow<String>(extraBufferCapacity = 4)

    /** Le tête-à-tête lisible à ouvrir : l'écran navigue. */
    val openRequests: SharedFlow<String> = _openRequests.asSharedFlow()

    private val _notices = MutableSharedFlow<PeerWithoutDeviceNotice>(extraBufferCapacity = 4)
    val notices: SharedFlow<PeerWithoutDeviceNotice> = _notices.asSharedFlow()

    private var host: ChatControllerHost? = null

    override fun attach(host: ChatControllerHost) {
        this.host = host
        val facts = host.uiState
            .map { PeerFacts(it.isEndToEnd, it.isKnownDirect, it.directPeerUserId, it.conversationTitle) }
            .distinctUntilChanged()
        host.scope.launch {
            combine(facts, reach.withoutEncryptedDevice, opening) { peer, without, isOpening ->
                val lacks = peer.peerUserId != null && peer.peerUserId in without
                if (!EndToEndPeerWithoutDeviceBannerRule.shows(peer.sealsEndToEnd, peer.isDirect, lacks)) null
                else PeerWithoutDeviceBanner(PeerFirstName.of(peer.peerName), isOpening)
            }.collect { _banner.value = it }
        }
        host.scope.launch {
            facts.filter { it.sealsEndToEnd && it.isDirect }
                .mapNotNull { it.peerUserId }
                .distinctUntilChanged()
                .collect { reach.refresh(it) }
        }
        host.scope.launch {
            redirect.redirected
                .filter { it.fromConversationId == host.conversationId }
                .collect { _openRequests.emit(it.toConversationId) }
        }
    }

    /** « Écrire sans chiffrement » : ouvre le tête-à-tête lisible sans rien envoyer, ou dit pourquoi il ne s'ouvre pas. */
    fun writePlain() {
        val host = host ?: return
        if (opening.value) return
        val state = host.uiState.value
        val peer = state.directPeerUserId ?: return
        if (state.isOffline) {
            _notices.tryEmit(PeerWithoutDeviceNotice.OFFLINE)
            return
        }
        opening.value = true
        host.scope.launch {
            try {
                val opened = redirect.open(host.conversationId, peer)
                if (opened != null) _openRequests.emit(opened) else _notices.emit(PeerWithoutDeviceNotice.OPEN_FAILED)
            } finally {
                opening.value = false
            }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class EndToEndPeerWithoutDeviceControllerModule {

    @Binds
    @IntoSet
    abstract fun controller(impl: EndToEndPeerWithoutDeviceController): ChatController
}
