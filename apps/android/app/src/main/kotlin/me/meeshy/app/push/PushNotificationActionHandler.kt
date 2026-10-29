package me.meeshy.app.push

import android.content.Context
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.lock.ConversationLockStore
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.push.PushNotificationActions
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.outbox.EndToEndOutboxAdmission
import me.meeshy.sdk.outbox.OutboxAdmissionVerdict
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Ce que font les boutons « Répondre », « Marquer comme lu » et « Commenter » d'une bannière, hors de l'écran.
 * La réponse passe par la file d'envoi existante ([MessageRepository.sendOptimistic] : la bulle
 * naît `SENDING`, la mutation rejoint la file de sa conversation, rejouée au retour du réseau), CITE le message
 * notifié (`replyToId`, comme iOS `replyToId: payload.messageId`) puis marque la conversation lue ; « lu » par
 * [ConversationRepository.markReadOptimistic]. Le commentaire passe par la file durable aussi
 * ([PostRepository.queueComment], `CREATE_COMMENT` : rejeu sans doublon sous le même `X-Client-Mutation-Id`), puis la
 * cloche est marquée lue.
 *
 * Fail-closed en conversation chiffrée de bout en bout : ce natif ne sait pas chiffrer, donc
 * rien ne part en clair ([Outcome.END_TO_END]) — la même loi que le drainer de la file
 * ([EndToEndOutboxAdmission.verdictFor]), lue AVANT de créer une bulle condamnée. Un mode encore INCONNU est relu au
 * serveur ; toujours inconnu, on refuse proprement ([Outcome.MODE_UNKNOWN]) plutôt que de faire naître une bulle que le
 * drainer retiendrait. Une conversation verrouillée par code n'agit pas non plus ([Outcome.LOCKED]).
 */
@Singleton
class PushNotificationActionHandler @Inject constructor(
    @ApplicationContext private val context: Context,
    private val sessionRepository: SessionRepository,
    private val messageRepository: MessageRepository,
    private val conversationRepository: ConversationRepository,
    private val admission: EndToEndOutboxAdmission,
    private val postRepository: PostRepository,
    private val notificationRepository: NotificationRepository,
    private val lockStore: ConversationLockStore,
) {
    /** [dismissesBanner] : l'action est prise en compte, la bannière s'en va ; sinon elle reste, intacte. */
    enum class Outcome(val dismissesBanner: Boolean) {
        SENT(true),
        MARKED_READ(true),
        EMPTY(false),
        NOT_SIGNED_IN(false),
        END_TO_END(false),

        /** Le mode de la conversation est encore inconnu (hors ligne) : aucune bulle condamnée ne naît, la bannière reste. */
        MODE_UNKNOWN(false),

        /** La conversation est verrouillée par code : aucune action rapide depuis la bannière. */
        LOCKED(false),

        COMMENT_QUEUED(true),

        /** La bannière appartient à un autre compte que celui connecté : rien ne part, elle s'en va. */
        ACCOUNT_CHANGED(true),
        FAILED(false),
    }

    /** [accountId] : le compte connecté quand la bannière a été posée (null s'il n'était pas encore connu). */
    suspend fun reply(conversationId: String, text: String, accountId: String? = null, replyToId: String? = null): Outcome {
        val content = text.trim()
        if (content.isEmpty()) return Outcome.EMPTY
        val user = signedInUser() ?: return Outcome.NOT_SIGNED_IN
        if (accountId != null && accountId != user.id) return Outcome.ACCOUNT_CHANGED
        if (lockStore.isLocked(conversationId)) return Outcome.LOCKED
        return guarded {
            when (admission.verdictFor(conversationId)) {
                OutboxAdmissionVerdict.ADMIT -> Unit
                OutboxAdmissionVerdict.WITHHOLD -> return@guarded Outcome.END_TO_END
                OutboxAdmissionVerdict.WAIT, OutboxAdmissionVerdict.UNREACHABLE -> return@guarded Outcome.MODE_UNKNOWN
            }
            messageRepository.sendOptimistic(
                conversationId = conversationId,
                content = content,
                originalLanguage = user.systemLanguage ?: LanguageResolver.FALLBACK_LANGUAGE,
                sender = user,
                replyToId = replyToId,
            )
            WorkManager.getInstance(context).enqueue(OutboxFlushWorker.buildRequest())
            runCatching { conversationRepository.markReadOptimistic(conversationId) }
                .onFailure { Timber.w(it, "Post-reply markRead failed") }
            Outcome.SENT
        }
    }

    /**
     * Commente [postId] depuis la bannière (iOS `handleComment`) : un fil (`post_comment`, `comment_reply`, …) répond à
     * [notifiedCommentId], une publication d'ami commente à la racine. La langue n'est pas déclarée (le serveur la devine,
     * comme iOS #6587). Un compte anonyme ne commente pas. Commenter, c'est consommer : la cloche passe lue
     * ([serverNotificationId]) — un échec réseau de cette marque ne défait pas le commentaire déjà gardé.
     */
    suspend fun comment(
        postId: String,
        text: String,
        accountId: String? = null,
        type: String? = null,
        notifiedCommentId: String? = null,
        serverNotificationId: String? = null,
    ): Outcome {
        val content = text.trim()
        if (content.isEmpty()) return Outcome.EMPTY
        val user = signedInUser() ?: return Outcome.NOT_SIGNED_IN
        if (user.isAnonymous == true) return Outcome.NOT_SIGNED_IN
        if (accountId != null && accountId != user.id) return Outcome.ACCOUNT_CHANGED
        return guarded {
            val parentId = PushNotificationActions.threadedParentCommentId(type, notifiedCommentId)
            postRepository.queueComment(postId, content, parentId) ?: return@guarded Outcome.FAILED
            WorkManager.getInstance(context).enqueue(OutboxFlushWorker.buildRequest())
            serverNotificationId?.let { id ->
                runCatching { notificationRepository.markAsRead(id) }
                    .onFailure { Timber.w(it, "Post-comment bell markRead failed") }
            }
            Outcome.COMMENT_QUEUED
        }
    }

    suspend fun markRead(conversationId: String, accountId: String? = null): Outcome {
        val user = signedInUser() ?: return Outcome.NOT_SIGNED_IN
        if (accountId != null && accountId != user.id) return Outcome.ACCOUNT_CHANGED
        if (lockStore.isLocked(conversationId)) return Outcome.LOCKED
        return guarded {
            conversationRepository.markReadOptimistic(conversationId)
            WorkManager.getInstance(context).enqueue(OutboxFlushWorker.buildRequest())
            Outcome.MARKED_READ
        }
    }

    /** Un process réveillé par le bouton n'a pas forcément restauré sa session : on l'attend, bornée. */
    private suspend fun signedInUser(): MeeshyUser? {
        sessionRepository.currentUser.value?.let { return it }
        return withTimeoutOrNull(SESSION_BUDGET_MILLIS) {
            sessionRepository.refresh()
            sessionRepository.currentUser.filterNotNull().first()
        }
    }

    private suspend fun guarded(action: suspend () -> Outcome): Outcome = try {
        action()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Exception) {
        Timber.w(failure, "Notification action failed")
        Outcome.FAILED
    }

    private companion object {
        const val SESSION_BUDGET_MILLIS = 6_000L
    }
}
