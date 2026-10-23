package me.meeshy.sdk.chat

import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.core.common.IoDispatcher
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.sdk.lang.ReaderPrism
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.model.MessageStarredEvent
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.theme.accentHex
import me.meeshy.sdk.theme.displayTitle
import org.json.JSONObject
import timber.log.Timber

/** La lecture Room des favoris temps réel : message et conversation du cache, prisme du lecteur. */
@Singleton
class RoomStarredSource @Inject constructor(
    private val messageDao: MessageDao,
    private val conversationDao: ConversationDao,
    private val session: SessionRepository,
    @IoDispatcher private val io: CoroutineDispatcher,
) : StarredSource {
    override suspend fun message(messageId: String): ApiMessage? = withContext(io) {
        messageDao.find(messageId)?.let { runCatching { MeeshyApi.json.decodeFromString<ApiMessage>(it.payload) }.getOrNull() }
    }

    override suspend fun conversation(conversationId: String): ApiConversation? = withContext(io) {
        conversationDao.find(conversationId)?.let {
            runCatching { MeeshyApi.json.decodeFromString<ApiConversation>(it.payload) }.getOrNull()
        }
    }

    override suspend fun readerPrism(): List<String> {
        val user = session.currentUser.value
        return if (user == null) listOfNotNull(Locale.getDefault().language.takeIf { it.isNotBlank() })
        else ReaderPrism.resolve(user, Locale.getDefault())
    }
}

/**
 * Branche les favoris sur la socket : `message:starred` (étoile posée ou retirée depuis un
 * autre appareil), et les flux `message:deleted` / `expired` / `edited` déjà routés par
 * [MessageSocketManager]. Chaque trame est isolée (try/catch) : aucun écouteur ne tue la session.
 */
@Singleton
class StarredMessagesRealtimeBinding @Inject constructor(
    private val socketManager: SocketManager,
    private val messageSocketManager: MessageSocketManager,
    private val store: StarredMessagesStore,
    private val source: RoomStarredSource,
    private val session: SessionRepository,
    @IoDispatcher private val io: CoroutineDispatcher,
) : RealtimeBinding, PerAccountCache {

    private var scope: CoroutineScope? = null

    private val sync: StarredMessagesSync
        get() = StarredMessagesSync(
            store = store,
            source = source,
            conversationName = { it.displayTitle(session.currentUserId) },
            conversationAccent = { it.accentHex() },
            nowMillis = System::currentTimeMillis,
        )

    override fun attach() {
        detach()
        val live = CoroutineScope(SupervisorJob() + io).also { scope = it }
        socketManager.on("message:starred") { args -> onStarredFrame(args) }
        live.launchSafely { messageSocketManager.messageDeleted.collect { sync.onGone(it.messageId) } }
        live.launchSafely { messageSocketManager.messageExpired.collect { sync.onGone(it.messageId) } }
        live.launchSafely { messageSocketManager.messageEdited.collect { sync.onEdited(it) } }
    }

    override fun detach() {
        scope?.coroutineContext?.get(Job)?.cancel()
        scope = null
    }

    override suspend fun clear() = store.clearAll()

    private fun onStarredFrame(args: Array<Any>) {
        val live = scope ?: return
        val raw = (args.firstOrNull() as? JSONObject)?.toString() ?: return
        live.launchSafely {
            val event = MeeshyApi.json.decodeFromString<MessageStarredEvent>(raw)
            sync.onStarred(event)
        }
    }

    private fun CoroutineScope.launchSafely(block: suspend () -> Unit) {
        launch {
            try {
                block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Timber.e(e, "Favoris temps réel en échec")
            }
        }
    }
}
