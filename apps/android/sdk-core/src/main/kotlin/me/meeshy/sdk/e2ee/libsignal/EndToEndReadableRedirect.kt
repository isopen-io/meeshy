package me.meeshy.sdk.e2ee.libsignal

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.core.e2ee.wire.E2eeServedIds
import me.meeshy.sdk.R
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.e2ee.ConversationEncryptionProviding
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.e2ee.PeerFirstName
import me.meeshy.sdk.model.e2ee.ReadableDirectOpening
import me.meeshy.sdk.model.feedback.FeedbackToastKind
import me.meeshy.sdk.model.interlocutor
import me.meeshy.sdk.model.readableDirectConversationRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.session.SessionRepository
import timber.log.Timber

/** Compte les appareils chiffrés qu'un utilisateur a publiés (`GET /e2ee/keys/:userId/devices`). */
public fun interface EndToEndPeerDeviceCounting {
    public suspend fun encryptedDeviceCount(userId: String): Int
}

internal class DirectoryPeerDeviceCounter @Inject constructor(
    private val directory: RetrofitE2eeDirectoryClient,
) : EndToEndPeerDeviceCounting {
    override suspend fun encryptedDeviceCount(userId: String): Int =
        directory.devices(userId).devices.count { E2eeServedIds.isDevice(it.deviceId) }
}

/**
 * Ce que cet appareil SAIT des pairs sans appareil chiffré (#20076, miroir d'iOS `EndToEndPeerDeviceReach`) : appris par
 * la liste de leurs appareils à l'ouverture d'un fil chiffré, confirmé par le refus d'un envoi, oublié dès que la liste en
 * montre un — sauf un pair refusé au scellement, oublié au premier envoi scellé réussi (#20181). Une lecture qui échoue ne change rien : le bandeau ne paraît que sur ce qui est su, jamais sur une supposition.
 */
@Singleton
public class EndToEndPeerDeviceReach @Inject constructor(private val counter: EndToEndPeerDeviceCounting) {
    private val known = MutableStateFlow<Set<String>>(emptySet())

    /** Les pairs dont un envoi a été REFUSÉ au scellement (#20181) : une liste qui montre un appareil ne les efface pas. */
    private val refused = MutableStateFlow<Set<String>>(emptySet())

    public val withoutEncryptedDevice: StateFlow<Set<String>> = known.asStateFlow()

    public fun lacksEncryptedDevice(userId: String): Boolean = userId in known.value

    public suspend fun refresh(userId: String) {
        if (userId.isBlank()) return
        val count = try {
            counter.encryptedDeviceCount(userId)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w("e2ee peer devices unread: %s", failure.javaClass.simpleName)
            return
        }
        if (count == 0) confirmWithoutDevice(userId) else if (userId !in refused.value) known.update { it - userId }
    }

    public fun confirmWithoutDevice(userId: String) {
        if (userId.isNotBlank()) known.update { it + userId }
    }

    /** Le scellement n'a rien pu ouvrir pour [userId] (#20181) : le bandeau tient jusqu'à un envoi scellé réussi. */
    public fun confirmUnreachable(userId: String) {
        if (userId.isBlank()) return
        refused.update { it + userId }
        confirmWithoutDevice(userId)
    }

    /** Un envoi scellé pour [userId] est parti : il a un appareil qui chiffre. */
    public fun confirmReachable(userId: String) {
        refused.update { it - userId }
        known.update { it - userId }
    }
}

/** L'envoi d'un fil chiffré est parti dans le tête-à-tête lisible : le fil d'où il part l'ouvre. */
public data class EndToEndRedirected(val fromConversationId: String, val toConversationId: String)

/** Ce que la redirection demande au reste de l'app : ouvrir le tête-à-tête lisible, le ranger, y envoyer. */
public interface ReadableDirectPort {
    public suspend fun open(peerUserId: String): NetworkResult<ApiConversation>

    public suspend fun remember(conversation: ApiConversation)

    /** `true` : la ligne est en file et partira ; `false` : l'outbox ne l'a pas prise, la bulle est en échec (#20182). */
    public suspend fun send(
        conversationId: String,
        text: String,
        language: String,
        sender: MeeshyUser,
        clientMessageId: String,
        effects: MessageEffects,
    ): Boolean
}

internal class RepositoryReadableDirectPort @Inject constructor(
    private val api: ConversationApi,
    private val conversations: ConversationRepository,
    private val messages: MessageRepository,
) : ReadableDirectPort {
    override suspend fun open(peerUserId: String): NetworkResult<ApiConversation> =
        apiCall { api.create(readableDirectConversationRequest(peerUserId)) }

    override suspend fun remember(conversation: ApiConversation) = conversations.rememberServed(conversation)

    override suspend fun send(
        conversationId: String,
        text: String,
        language: String,
        sender: MeeshyUser,
        clientMessageId: String,
        effects: MessageEffects,
    ): Boolean = messages.sendQueued(
        conversationId = conversationId,
        content = text,
        originalLanguage = language,
        sender = sender,
        effects = effects,
        clientMessageId = clientMessageId,
    ).isQueued
}

/**
 * Le tête-à-tête LISIBLE d'une paire dont le pair n'a aucun appareil chiffré (#20076, miroir d'iOS
 * `EndToEndReadableRedirect`) : retrouvé ou créé (`plaintext: true`), relu, puis il reçoit le texte qu'un envoi chiffré
 * n'a pas pu remettre, et il s'ouvre.
 *
 * Aucun clair n'entre jamais dans le fil chiffré (#12949) : le texte part dans l'AUTRE conversation, que la passerelle
 * sert sans bout en bout et que cet appareil n'a jamais vue chiffrée ([ReadableDirectOpening]). Toute étape qui échoue
 * rend `false`/`null`, et l'appelant garde le refus lisible d'avant. Ce qui part : le texte, sa langue et son effet (vue
 * unique, éphémère, flou — #20182) ; la citation (le message cité vit dans le fil chiffré) ne part pas, les pièces sont
 * refusées en amont.
 *
 * L'envoi passe par la file durable sous un `cid_` DÉRIVÉ de celui de la bulle chiffrée : une ligne rejouée après un arrêt
 * retrouve sa bulle, rien ne part deux fois.
 */
@Singleton
public class EndToEndReadableRedirect internal constructor(
    private val port: ReadableDirectPort,
    private val encryption: ConversationEncryptionProviding,
    private val ledger: EndToEndRegimeLedger,
    private val session: SessionRepository,
    private val toasts: FeedbackToastCenter,
    private val notice: (firstName: String) -> String,
) {
    @Inject public constructor(
        @ApplicationContext context: Context,
        port: ReadableDirectPort,
        encryption: ConversationEncryptionProviding,
        ledger: EndToEndRegimeLedger,
        session: SessionRepository,
        toasts: FeedbackToastCenter,
    ) : this(port, encryption, ledger, session, toasts, { name ->
        if (name.isEmpty()) context.getString(R.string.e2ee_send_redirected_to_readable_anonymous)
        else context.getString(R.string.e2ee_send_redirected_to_readable, name)
    })

    private val events = MutableSharedFlow<EndToEndRedirected>(extraBufferCapacity = 8)

    /** Chaque envoi redirigé : le fil [EndToEndRedirected.fromConversationId], s'il est à l'écran, ouvre l'autre. */
    public val redirected: SharedFlow<EndToEndRedirected> = events.asSharedFlow()

    /** Ouvre le tête-à-tête lisible sans rien envoyer (le bandeau du fil) : son identifiant, ou `null`. */
    public suspend fun open(fromConversationId: String, peerUserId: String): String? =
        readableDestination(fromConversationId, peerUserId)?.let { (destination, conversation) ->
            port.remember(conversation)
            destination
        }

    /** Envoie [text] dans le tête-à-tête lisible et dit pourquoi ; `false` : rien n'est parti. */
    public suspend fun deliver(
        fromConversationId: String,
        peerUserId: String,
        clientMessageId: String,
        text: String,
        language: String?,
        effects: MessageEffects = MessageEffects(),
    ): Boolean {
        if (text.isBlank()) return false
        val sender = session.currentUser.value ?: return false
        val (destination, conversation) = readableDestination(fromConversationId, peerUserId) ?: return false
        return try {
            port.remember(conversation)
            val sentLanguage = language?.takeIf { it.isNotBlank() } ?: LanguageResolver.resolveUserLanguage(sender)
            if (!port.send(destination, text, sentLanguage, sender, OutboxIds.derivedCid("$SEED|$clientMessageId"), effects)) return false
            toasts.show(notice(PeerFirstName.of(conversation.interlocutor(sender.id)?.name)), FeedbackToastKind.INFO)
            events.tryEmit(EndToEndRedirected(fromConversationId, destination))
            true
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w("e2ee readable redirect not sent: %s", failure.javaClass.simpleName)
            false
        }
    }

    private suspend fun readableDestination(from: String, peerUserId: String): Pair<String, ApiConversation>? {
        if (peerUserId.isBlank()) return null
        val opened = (port.open(peerUserId) as? NetworkResult.Success)?.data ?: return null
        val served = (encryption.status(opened.id) as? NetworkResult.Success)?.data ?: return null
        val openedIsEndToEnd = served.isEndToEnd || ledger.isSealed(opened.id)
        val destination = ReadableDirectOpening.destination(opened.id, from, openedIsEndToEnd) ?: return null
        return destination to opened
    }

    private companion object {
        const val SEED = "e2ee-readable"
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface EndToEndReadableRedirectModule {
    @Binds
    fun counter(impl: DirectoryPeerDeviceCounter): EndToEndPeerDeviceCounting

    @Binds
    fun port(impl: RepositoryReadableDirectPort): ReadableDirectPort
}
