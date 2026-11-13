package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.relation.RelationLink
import me.meeshy.sdk.model.relation.TalkieOfferRule
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.relation.CirclesGateway
import me.meeshy.sdk.talkie.TalkieSendControl
import me.meeshy.sdk.talkie.TalkieSenderFactory
import me.meeshy.sdk.talkie.TalkieSpeakingPeers

/**
 * Le talkie dans l'en-tête d'un direct (#17315, iso `ConversationHeaderTalkieButton` + `TalkieOfferModel`) : proposé dès
 * Proche — le cache des liens d'abord, puis le lien servi, qui a le dernier mot —, un émetteur par fil, et qui me parle en
 * ce moment pour donner la barre à la voix du pair.
 */
@HiltViewModel
class ChatHeaderTalkieViewModel @Inject constructor(
    factory: TalkieSenderFactory,
    private val circles: CirclesGateway,
    speakingPeers: TalkieSpeakingPeers,
) : ViewModel() {
    val control: TalkieSendControl = factory.control(viewModelScope)

    /** Les émetteurs qui sortent chez moi en ce moment. */
    val speaking: StateFlow<Set<String>> = speakingPeers.speaking

    private val _offered = MutableStateFlow(false)
    val offered: StateFlow<Boolean> = _offered.asStateFlow()

    private var loadedFor: String? = null

    fun load(peerUserId: String) {
        if (loadedFor == peerUserId) return
        loadedFor = peerUserId
        viewModelScope.launch {
            circles.cachedLinks()?.let { apply(it, peerUserId) }
            (circles.refreshLinks() as? NetworkResult.Success)?.let { apply(it.data, peerUserId) }
        }
    }

    private fun apply(links: List<RelationLink>, peerUserId: String) {
        val mine = links.firstOrNull { it.userId.equals(peerUserId, ignoreCase = true) } ?: return
        _offered.value = TalkieOfferRule.offers(mine)
    }

    override fun onCleared() {
        control.close()
    }
}
