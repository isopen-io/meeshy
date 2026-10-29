package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import me.meeshy.sdk.user.ContactCardMeeshyAccount
import me.meeshy.sdk.user.ContactCardMeeshyLookup
import me.meeshy.ui.component.bubble.BubbleContactCardAccounts
import me.meeshy.ui.component.bubble.BubbleFile

/** Porte le service de rapprochement jusqu'à l'écran du fil (un singleton : tous les fils partagent les caches). */
@HiltViewModel
internal class ChatContactCardsViewModel @Inject constructor(val lookup: ContactCardMeeshyLookup) : ViewModel()

/**
 * La rangée « Sur Meeshy » des cartes de visite du fil (#13495). Deux portes, toutes deux FERMÉES par défaut : la carte
 * doit être DÉJÀ sur l'appareil (envoi local, ou reçue pendant la session — la politique de téléchargement n'est
 * jamais contournée), et ni son message ni la conversation ne doivent être chiffrés de bout en bout (#13622).
 */
internal class ChatContactCardAccounts(
    private val lookup: ContactCardMeeshyLookup,
    private val conversationIsEndToEnd: Boolean,
    private val downloadedUri: (attachmentId: String) -> String?,
) : BubbleContactCardAccounts {

    override fun cached(file: BubbleFile): ContactCardMeeshyAccount? =
        lookup.cached(file.attachmentId, file.contactScope.inConversation(conversationIsEndToEnd))

    override suspend fun lookup(file: BubbleFile): ContactCardMeeshyAccount? {
        val uri = file.localUri ?: downloadedUri(file.attachmentId) ?: return null
        return lookup.lookup(file.attachmentId, uri, file.contactScope.inConversation(conversationIsEndToEnd))
    }
}
