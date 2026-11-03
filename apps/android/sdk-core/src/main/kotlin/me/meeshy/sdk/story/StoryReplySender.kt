package me.meeshy.sdk.story

import androidx.work.WorkManager
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.DirectConversationResolution
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.conversationOrNull
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.lang.ComposeLanguageDetector
import me.meeshy.sdk.lang.LanguageIdentifying
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxFlushWorker

/** Ce qu'un envoi de réponse privée devient ; l'écran le traduit en feuille fermée, mots rendus ou refus dit. */
enum class StoryReplyOutcome { SENT, FAILED, ENCRYPTED }

/**
 * Envoie une réponse PRIVÉE à une story ou à une humeur (miroir de `MoodReplySender` iOS) : la dernière
 * conversation directe avec l'auteur, sinon une neuve ([ConversationRepository.directConversationWith]),
 * langue de composition par le prisme, puis bulle optimiste + outbox (rejouée avec le `clientMessageId`
 * hors ligne). Fail-closed : une directe chiffrée de bout en bout, que cet appareil ne sait pas écrire,
 * est refusée AVANT toute mise en file — la file rejoue en clair.
 */
class StoryReplySender(
    private val conversations: ConversationRepository,
    private val messages: MessageRepository,
    private val endToEndRegime: EndToEndRegimeLedger,
    private val flushOutbox: () -> Unit,
) {
    @Inject
    constructor(
        conversations: ConversationRepository,
        messages: MessageRepository,
        endToEndRegime: EndToEndRegimeLedger,
        workManager: WorkManager,
    ) : this(conversations, messages, endToEndRegime, { workManager.enqueue(OutboxFlushWorker.buildRequest()) })

    suspend fun send(text: String, storyId: String, authorId: String, sender: MeeshyUser): StoryReplyOutcome {
        if (text.isBlank() || storyId.isBlank() || authorId.isBlank()) return StoryReplyOutcome.FAILED
        return try {
            deliver(text, storyId, authorId, sender)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            StoryReplyOutcome.FAILED
        }
    }

    private suspend fun deliver(text: String, storyId: String, authorId: String, sender: MeeshyUser): StoryReplyOutcome {
        val resolution = conversations.directConversationWith(authorId)
        val conversationId = resolution.conversationOrNull?.id ?: return StoryReplyOutcome.FAILED
        if (endToEndRegime.isSealed(conversationId)) return StoryReplyOutcome.ENCRYPTED
        val mode = knownMode(resolution, conversationId) ?: return StoryReplyOutcome.FAILED
        if (EndToEndRegime.isEndToEnd(mode.value)) return StoryReplyOutcome.ENCRYPTED
        val language = ComposeLanguageDetector.originalLanguageAtSend(
            text = text,
            manual = null,
            senderLanguage = LanguageResolver.resolveUserLanguage(sender),
            identifier = LanguageIdentifying.Unavailable,
        )
        messages.sendOptimistic(
            conversationId = conversationId,
            content = text,
            originalLanguage = language,
            sender = sender,
            storyReplyToId = storyId,
        )
        flushOutbox()
        return StoryReplyOutcome.SENT
    }

    /** Le mode de la conversation quand il est connu (null dans [KnownMode] = clair), ou null quand il ne peut pas être appris maintenant. */
    private suspend fun knownMode(resolution: DirectConversationResolution, conversationId: String): KnownMode? {
        val served = resolution.conversationOrNull ?: return null
        val cachedOnly = resolution is DirectConversationResolution.Found && resolution.fromCache
        if (!cachedOnly || !served.encryptionMode.isNullOrBlank()) return KnownMode(served.encryptionMode)
        val fresh = (conversations.getById(conversationId) as? NetworkResult.Success)?.data ?: return null
        conversations.rememberServed(fresh)
        return KnownMode(fresh.encryptionMode)
    }

    private data class KnownMode(val value: String?)
}
