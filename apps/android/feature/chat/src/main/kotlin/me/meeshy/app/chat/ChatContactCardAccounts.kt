package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.ConversationClearance
import me.meeshy.sdk.user.ContactCardMeeshyAccount
import me.meeshy.sdk.user.ContactCardMeeshyLookup
import me.meeshy.ui.component.bubble.BubbleContactCardAccounts
import me.meeshy.ui.component.bubble.BubbleFile

/** Porte le service de rapprochement jusqu'à l'écran du fil (un singleton : tous les fils partagent les caches). */
@HiltViewModel
internal class ChatContactCardsViewModel @Inject constructor(
    val lookup: ContactCardMeeshyLookup,
    private val ledger: EndToEndRegimeLedger,
) : ViewModel() {

    /**
     * Ce que l'appareil SAIT du mode de la conversation (#13628), la même lecture que la garde du clair de l'outbox : le
     * registre du compte, puis le mode servi, puis la confirmation qu'un mode nul a bien été SERVI nul.
     */
    fun clearance(conversationId: String, encryptionMode: String?): ConversationClearance =
        if (conversationId.isBlank()) {
            ConversationClearance.UNKNOWN
        } else {
            ConversationClearance.of(
                sealedInLedger = ledger.isSealed(conversationId),
                cachedMode = encryptionMode,
                servedClearConfirmed = ledger.isClearConfirmed(conversationId),
            )
        }
}

/**
 * La rangée « Sur Meeshy » des cartes de visite du fil (#13495). Trois portes, toutes FERMÉES par défaut : la carte
 * doit avoir été TÉLÉCHARGÉE par le fil pendant la session (la politique de téléchargement n'est jamais contournée, et
 * l'adresse servie d'une pièce n'est jamais lue), ni son message ni la conversation ne doivent être chiffrés de bout en bout (#13622), et le mode
 * de la conversation doit être CONNU clair (#13628) : un mode jamais servi, ou que cette version ne connaît pas, ferme.
 */
internal class ChatContactCardAccounts(
    private val lookup: ContactCardMeeshyLookup,
    private val conversationIsEndToEnd: Boolean,
    private val clearance: ConversationClearance,
    private val downloadedUri: (attachmentId: String) -> String?,
) : BubbleContactCardAccounts {

    override fun cached(file: BubbleFile): ContactCardMeeshyAccount? =
        lookup.cached(file.attachmentId, scopeOf(file))

    override suspend fun lookup(file: BubbleFile): ContactCardMeeshyAccount? {
        val uri = downloadedUri(file.attachmentId) ?: return null
        return lookup.lookup(file.attachmentId, uri, scopeOf(file))
    }

    private fun scopeOf(file: BubbleFile) = file.contactScope.inConversation(conversationIsEndToEnd).under(clearance)
}
