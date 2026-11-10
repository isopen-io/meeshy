package me.meeshy.sdk.talkie

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.DirectConversationResolution
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.AttachmentMessageType
import me.meeshy.sdk.model.relation.TalkieCopyCandidate
import me.meeshy.sdk.model.relation.TalkieCopyDestination
import me.meeshy.sdk.model.relation.TalkieVoiceCopyName
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxOutcome
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.SessionRepository
import timber.log.Timber

/** Ce dont la copie vocale a besoin hors d'elle-même : le disque, les conversations, la file d'envoi. */
interface TalkieCopyPorts {
    /** Écrit la copie en `.m4a` ; rend sa durée (ms), `null` si rien n'a pu s'écrire. */
    fun write(frames: List<ByteArray>, file: File): Long?

    suspend fun shared(userId: String): List<TalkieCopyCandidate>

    /** Le direct avec [userId], trouvé ou créé ; `null` : ni l'un ni l'autre. */
    suspend fun openDirect(userId: String): String?

    /** Confie la copie à la file d'envoi durable sous [clientMessageId]. `false` : rien n'est parti. */
    suspend fun enqueue(file: File, durationMs: Long, conversationId: String, clientMessageId: String, name: String): Boolean

    /** Les `clientMessageId` que la file a abandonnés. */
    val exhausted: Flow<String>
}

/**
 * Le câblage de la copie vocale d'un talkie qui n'a pas pu passer (#17141, iso `TalkieVoiceCopySender`) : écrire le
 * fichier, choisir la conversation la plus RÉCENTE avec ce destinataire (ou celle que la passerelle a nommée), la confier
 * à la file d'envoi durable sous un `cid_<uuid v4>`. L'abandon d'une copie par la file remonte en [failures].
 */
class TalkieVoiceCopySender internal constructor(
    private val ports: TalkieCopyPorts,
    private val directory: File,
    private val newClientMessageId: () -> String = OutboxIds::cid,
    private val now: () -> Long = System::currentTimeMillis,
) : TalkieVoiceCopying {

    private val queued = java.util.Collections.synchronizedSet(mutableSetOf<String>())

    override val failures: Flow<Unit> = ports.exhausted.filter { queued.remove(it) }.map { }

    override suspend fun send(frames: List<ByteArray>, toUserId: String, conversationId: String?): Boolean {
        if (frames.isEmpty()) return false
        val file = File(directory, "talkie-copy-${UUID.randomUUID()}.m4a")
        val name = TalkieVoiceCopyName.of(now())
        val durationMs = withContext(Dispatchers.IO) { ports.write(frames, file) } ?: return false
        val clientMessageId = newClientMessageId()
        val target = conversationId ?: destination(toUserId)
        queued.add(clientMessageId)
        val sent = target != null && runCatching { ports.enqueue(file, durationMs, target, clientMessageId, name) }
            .onFailure { if (it is CancellationException) throw it }
            .getOrDefault(false)
        if (!sent) {
            queued.remove(clientMessageId)
            file.delete()
            Timber.w("talkie · copie vocale non partie")
        }
        return sent
    }

    private suspend fun destination(userId: String): String? {
        val candidates = runCatching { ports.shared(userId) }.getOrDefault(emptyList())
        return TalkieCopyDestination.pick(candidates) ?: ports.openDirect(userId)
    }
}

/** Les ports réels de la copie vocale, branchés sur les dépôts de l'app. */
@Singleton
class LiveTalkieCopyPorts @Inject constructor(
    private val conversations: ConversationRepository,
    private val messages: MessageRepository,
    private val uploads: MediaUploadQueue,
    private val outbox: OutboxRepository,
    private val session: SessionRepository,
) : TalkieCopyPorts {

    override fun write(frames: List<ByteArray>, file: File): Long? = TalkieVoiceCopyFile.write(frames, file)

    override suspend fun shared(userId: String): List<TalkieCopyCandidate> =
        (conversations.listSharedWith(userId) as? NetworkResult.Success)?.data.orEmpty().map(::candidate)

    override suspend fun openDirect(userId: String): String? = when (val resolved = conversations.directConversationWith(userId)) {
        is DirectConversationResolution.Found -> resolved.conversation.id
        is DirectConversationResolution.Created -> resolved.conversation.id
        else -> null
    }

    override suspend fun enqueue(file: File, durationMs: Long, conversationId: String, clientMessageId: String, name: String): Boolean {
        val sender = session.currentUser.value ?: return false
        val item = MediaUploadItem.onDisk(file, name, MIME_TYPE, durationMs)
        val cmid = OutboxIds.derivedCmid("talkie-copy|$clientMessageId")
        uploads.enqueueAs(cmid, item, conversationId = conversationId)
        val attachment = ApiMessageAttachment(
            id = cmid,
            fileName = name,
            originalName = name,
            mimeType = MIME_TYPE,
            fileSize = file.length().toInt(),
            duration = durationMs.toInt(),
        )
        messages.sendOptimistic(
            conversationId = conversationId,
            content = "",
            originalLanguage = sender.systemLanguage?.takeIf { it.isNotBlank() } ?: LanguageResolver.FALLBACK_LANGUAGE,
            sender = sender,
            messageType = AttachmentMessageType.AUDIO,
            attachmentUploadCmids = listOf(cmid),
            attachments = listOf(attachment),
            clientMessageId = clientMessageId,
        )
        return true
    }

    override val exhausted: Flow<String> = outbox.outcomes.filterIsInstance<OutboxOutcome.Exhausted>().map { it.cmid }

    private fun candidate(served: ApiConversation): TalkieCopyCandidate = TalkieCopyCandidate(
        id = served.id,
        type = served.type,
        encryptionMode = served.encryptionMode,
        isActive = served.isActive,
        isAnnouncementChannel = served.isAnnouncementChannel,
        writeRestricted = served.viewerWriteRestriction != null,
        rankAtMs = (served.listRankAt ?: served.lastMessage?.createdAt ?: served.updatedAt)?.let(::epochMs),
    )

    private fun epochMs(iso: String): Long? = runCatching { Instant.parse(iso).toEpochMilli() }.getOrNull()

    private companion object {
        const val MIME_TYPE = "audio/mp4"
    }
}

/** La fabrique de copie vocale, avec son dossier de travail dans le cache de l'app. */
@Singleton
class TalkieVoiceCopyFactory @Inject constructor(
    @ApplicationContext private val context: Context,
    private val ports: LiveTalkieCopyPorts,
) {
    fun create(): TalkieVoiceCopying = TalkieVoiceCopySender(ports, File(context.cacheDir, "talkie").apply { mkdirs() })
}
