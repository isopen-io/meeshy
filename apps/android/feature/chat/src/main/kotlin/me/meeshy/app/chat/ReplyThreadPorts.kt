package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.util.Locale
import javax.inject.Inject
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.lang.ReaderPrism
import me.meeshy.sdk.model.thread.ThreadReply
import me.meeshy.sdk.model.thread.ThreadReplyStatus
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.thread.ThreadRepliesLoader
import me.meeshy.sdk.thread.ThreadRepliesPage

/** La lecture des réponses d'un message : le cache d'abord, puis le serveur par pages. */
interface ThreadRepliesPort {
    suspend fun cached(conversationId: String, parentId: String): List<ThreadReply>

    /** Lève sur échec réseau : l'appelant garde alors l'existant. */
    suspend fun load(conversationId: String, parentId: String, offset: Int): ThreadRepliesPage
}

/** L'envoi d'une réponse : bulle optimiste en Room + mutation en outbox ; rend la réponse optimiste. */
interface ThreadReplySenderPort {
    suspend fun send(conversationId: String, parentId: String, text: String): ThreadReply
}

internal class SessionThreadRepliesPort @Inject constructor(
    private val loader: ThreadRepliesLoader,
    private val session: SessionRepository,
) : ThreadRepliesPort {

    override suspend fun cached(conversationId: String, parentId: String): List<ThreadReply> =
        loader.cached(conversationId, parentId, session.currentUser.value?.id, prism())

    override suspend fun load(conversationId: String, parentId: String, offset: Int): ThreadRepliesPage =
        loader.load(conversationId, parentId, session.currentUser.value?.id, prism(), offset)

    private fun prism(): List<String> =
        session.currentUser.value?.let { ReaderPrism.resolve(it, Locale.getDefault()) }.orEmpty()
}

internal class RepositoryThreadReplySender @Inject constructor(
    private val messages: MessageRepository,
    private val session: SessionRepository,
) : ThreadReplySenderPort {

    override suspend fun send(conversationId: String, parentId: String, text: String): ThreadReply {
        val user = checkNotNull(session.currentUser.value) { "no session" }
        val cid = messages.sendOptimistic(
            conversationId = conversationId,
            content = text,
            originalLanguage = LanguageResolver.resolveUserLanguage(user),
            sender = user,
            replyToId = parentId,
        )
        return ThreadReply(
            id = cid,
            clientMessageId = cid,
            senderId = user.id,
            senderName = user.displayName ?: user.username,
            senderAvatarUrl = user.avatar,
            text = text,
            createdAtMillis = System.currentTimeMillis(),
            isMine = true,
            status = ThreadReplyStatus.SENDING,
        )
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ReplyThreadModule {
    @Binds
    abstract fun bindReplies(impl: SessionThreadRepliesPort): ThreadRepliesPort

    @Binds
    abstract fun bindSender(impl: RepositoryThreadReplySender): ThreadReplySenderPort
}
