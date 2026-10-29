package me.meeshy.app.chat.fileviewer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.DirectConversationOpener
import me.meeshy.sdk.conversation.DirectOpenResult
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.FriendConnectionCoordinator
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.contacts.ContactAccountActions
import me.meeshy.sdk.model.contacts.ContactCardRelation
import me.meeshy.sdk.model.contacts.ContactCardResolutionScope
import me.meeshy.sdk.model.contacts.ContactRelation
import me.meeshy.sdk.model.contacts.vcard.VCard
import me.meeshy.sdk.model.friend.FriendshipStatus
import me.meeshy.sdk.net.api.ContactResolveRequest
import me.meeshy.sdk.net.api.PublicContactAccount
import me.meeshy.sdk.user.ContactCardAccountResolver

/** Un compte Meeshy reconnu dans la carte, avec ce qu'on peut en faire (miroir de `ContactAccountActionRow`, iOS). */
internal data class ContactCardAccountRow(
    val account: PublicContactAccount,
    val relation: ContactRelation,
    val actions: ContactAccountActions,
    val isBusy: Boolean,
    /** Le compte est un bloqué : « Écrire » est retiré, la conversation ne s'ouvre pas. */
    val isBlocked: Boolean,
    /** Le visage du compte principal est déjà dans l'en-tête de la fiche. */
    val showsFace: Boolean,
) {
    val canWrite: Boolean get() = actions.canWrite && !isBlocked
}

internal sealed interface ContactCardAccountEvent {
    data class OpenConversation(val conversationId: String) : ContactCardAccountEvent
    data object OpenFailed : ContactCardAccountEvent
    data object ConnectFailed : ContactCardAccountEvent
}

/**
 * L'état d'UNE carte de visite reçue (miroir de `ContactCardViewModel`, iOS, #8101) : les comptes Meeshy
 * rapprochés de ses numéros et e-mails, et les deux gestes « Se connecter » / « Écrire ».
 *
 * - **Cache d'abord** : [bind] pose les comptes déjà résolus sans attendre ; la revalidation est silencieuse.
 * - **Optimiste** : la demande d'amitié passe par [FriendConnectionCoordinator], qui bascule le cache d'amitié
 *   AVANT le réseau et le restaure sur refus ; la relation servie suit ce cache.
 * - **Échec fermé** (#13633, miroir de #13622) : seule une conversation CONNUE claire ouvre la résolution ([ContactCardResolutionScope.mayResolveOnServer]) ;
 *   chiffrée de bout en bout, mode inconnu ou protocole futur ⇒ ni lecture du cache ni requête, coordonnées locales seules ; seule une
 *   portée chiffrée de bout en bout fait dire à la fiche que la vérification « Sur Meeshy » est indisponible dans une conversation
 *   chiffrée ([lookupUnavailable]) — un mode inconnu ferme en silence, comme iOS, car la conversation peut être claire.
 * - **Vie privée** (#9225) : la résolution est faite par la passerelle, qui ne rend que des comptes inscrits
 *   (profil public, jamais la présence) ; rien du carnet n'est conservé ici.
 */
@HiltViewModel
internal class ContactCardAccountsViewModel internal constructor(
    private val resolver: ContactCardAccountResolver,
    private val opener: DirectConversationOpener,
    private val connections: FriendConnectionCoordinator,
    private val friendshipCache: FriendshipCache,
    private val blockCache: BlockCache,
    private val defaultCountry: () -> String?,
) : ViewModel() {

    @Inject
    constructor(
        resolver: ContactCardAccountResolver,
        opener: DirectConversationOpener,
        connections: FriendConnectionCoordinator,
        friendshipCache: FriendshipCache,
        blockCache: BlockCache,
    ) : this(resolver, opener, connections, friendshipCache, blockCache, { Locale.getDefault().country.ifBlank { null } })

    private val accounts = MutableStateFlow<List<PublicContactAccount>>(emptyList())
    private val writing = MutableStateFlow<Set<String>>(emptySet())
    private var bound: Pair<ContactResolveRequest, ContactCardResolutionScope>? = null
    private val _lookupUnavailable = MutableStateFlow(false)

    /** La carte vient d'une conversation chiffrée de bout en bout : la fiche le dit (jamais pour un mode seulement inconnu). */
    val lookupUnavailable: StateFlow<Boolean> = _lookupUnavailable.asStateFlow()

    private val _events = MutableSharedFlow<ContactCardAccountEvent>(extraBufferCapacity = 8)
    val events: SharedFlow<ContactCardAccountEvent> = _events.asSharedFlow()

    private val _rows = MutableStateFlow<List<ContactCardAccountRow>>(emptyList())

    /** Les comptes à montrer, dans l'ordre du serveur ; vide tant que rien n'est résolu. */
    val rows: StateFlow<List<ContactCardAccountRow>> = _rows.asStateFlow()

    init {
        viewModelScope.launch {
            combine(
                accounts,
                friendshipCache.version,
                blockCache.version,
                connections.busyUserIds,
                writing,
            ) { list, _, _, busy, writingIds ->
                val primaryId = list.firstOrNull()?.userId
                list.map { account ->
                    val relation = ContactCardRelation.served(
                        resolved = account.relationState,
                        live = friendshipCache.status(account.userId),
                        cacheHydrated = friendshipCache.isHydrated,
                    )
                    ContactCardAccountRow(
                        account = account,
                        relation = relation,
                        actions = ContactAccountActions.resolve(relation),
                        isBusy = account.userId in busy || account.userId in writingIds,
                        isBlocked = blockCache.isBlocked(account.userId),
                        showsFace = account.userId != primaryId,
                    )
                }
            }.collect { _rows.value = it }
        }
    }

    /**
     * Résout la carte sous la portée de sa conversation : le cache sert tout de suite, le réseau revalide ; une carte sans
     * identifiant ne part pas, et hors d'une portée claire rien ne part ni ne se lit.
     */
    fun bind(card: VCard, scope: ContactCardResolutionScope) {
        val request = ContactResolveRequest.bounded(card.phones.map { it.value }, card.emails.map { it.value }, defaultCountry())
        if (bound == request to scope) return
        bound = request to scope
        _lookupUnavailable.value = scope == ContactCardResolutionScope.EndToEnd
        if (!scope.mayResolveOnServer) {
            accounts.value = emptyList()
            return
        }
        accounts.value = resolver.cached(request).orEmpty()
        if (request.isEmpty) return
        viewModelScope.launch {
            val resolved = resolver.resolve(request)
            if (bound == request to scope && resolved != accounts.value) accounts.value = resolved
        }
    }

    fun connect(userId: String) {
        viewModelScope.launch {
            connections.connect(userId)?.join()
            if (friendshipCache.status(userId) is FriendshipStatus.None) _events.emit(ContactCardAccountEvent.ConnectFailed)
        }
    }

    /** « Écrire » : la directe existante (cache, sans réseau) ou créée ; un bloqué est refusé. */
    fun write(userId: String) {
        if (userId in writing.value) return
        viewModelScope.launch {
            if (blockCache.isBlocked(userId)) {
                _events.emit(ContactCardAccountEvent.OpenFailed)
                return@launch
            }
            writing.update { it + userId }
            val result = try {
                opener.openOrCreate(userId)
            } finally {
                writing.update { it - userId }
            }
            _events.emit(
                when (result) {
                    is DirectOpenResult.Opened -> ContactCardAccountEvent.OpenConversation(result.conversationId)
                    DirectOpenResult.Queued, DirectOpenResult.Failed -> ContactCardAccountEvent.OpenFailed
                },
            )
        }
    }
}
