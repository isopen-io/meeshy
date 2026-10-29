package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.compose.runtime.staticCompositionLocalOf
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ConversationClearance
import me.meeshy.sdk.model.contacts.ContactCardResolutionScope
import me.meeshy.sdk.user.ContactCardMeeshyAccount
import me.meeshy.sdk.user.ContactCardMeeshyLookup
import me.meeshy.ui.component.bubble.BubbleContactCardAccounts
import me.meeshy.ui.component.bubble.BubbleContent
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

    /** La portée d'une carte : celle de la rangée sous la bulle ET de la fiche (#13633) — seul le clair CONFIRMÉ ouvre. */
    fun scopeFor(file: BubbleFile): ContactCardResolutionScope = scopeOf(file)

    /** La portée d'un message (et de sa pièce) passée par la conversation : chiffrée ou de mode inconnu, elle ferme. */
    fun underConversation(seed: ContactCardResolutionScope): ContactCardResolutionScope =
        seed.inConversation(conversationIsEndToEnd).under(clearance)

    private fun scopeOf(file: BubbleFile) = underConversation(file.contactScope)
}

/** La porte de la conversation que l'hôte du fil donne à la fiche d'une carte ; FERMÉE tant qu'aucun hôte n'en fournit. */
internal val LocalChatContactCardScope =
    staticCompositionLocalOf<(ContactCardResolutionScope) -> ContactCardResolutionScope> { { ContactCardResolutionScope.Unknown } }

/** La portée d'une carte ouverte depuis le hub média : la règle de la rangée, lue sur son message porteur. */
internal fun hubContactSeed(carrier: ApiMessage, attachment: ApiMessageAttachment): ContactCardResolutionScope =
    ContactCardResolutionScope.of(carrier).sealedBy(attachment)

/**
 * La portée de la pièce [attachmentId] : celle de ses bulles dans le fil et, pour une pièce que le fil n'a pas chargée,
 * celle que le hub a lue sur son porteur ([provided]) — toutes passées par la conversation ([gate]). La plus FERMÉE
 * l'emporte (une même pièce portée deux fois n'ouvre que si chaque porteur est clair), et une pièce introuvable ferme
 * ([ContactCardResolutionScope.Unknown]).
 */
internal fun List<BubbleContent>.contactScopeOf(
    attachmentId: String,
    gate: (ContactCardResolutionScope) -> ContactCardResolutionScope,
    provided: Map<String, ContactCardResolutionScope> = emptyMap(),
): ContactCardResolutionScope {
    val seeds = flatMap { it.files }.filter { it.attachmentId == attachmentId }.map { it.contactScope } +
        listOfNotNull(provided[attachmentId])
    val scopes = seeds.map(gate)
    return when {
        scopes.isEmpty() -> ContactCardResolutionScope.Unknown
        scopes.all { it == ContactCardResolutionScope.Clear } -> ContactCardResolutionScope.Clear
        ContactCardResolutionScope.EndToEnd in scopes -> ContactCardResolutionScope.EndToEnd
        else -> ContactCardResolutionScope.Unknown
    }
}
