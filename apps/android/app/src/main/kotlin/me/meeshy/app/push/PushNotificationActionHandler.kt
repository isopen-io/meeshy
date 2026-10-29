package me.meeshy.app.push

import android.content.Context
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.chat.ConversationDraftStore
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.lock.ConversationLockStore
import me.meeshy.sdk.model.KeptReplyDraft
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.push.PushNotificationActions
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.outbox.EndToEndOutboxAdmission
import me.meeshy.sdk.outbox.OutboxAdmissionVerdict
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.AccountClosedException
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.commitOrWrite
import me.meeshy.sdk.session.withAccountTicket
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
 * serveur (borné) ; toujours inconnu, aucune bulle ne naît mais la réponse n'est pas perdue : elle est gardée comme
 * brouillon de la conversation ([Outcome.DRAFT_KEPT], #13693), proposé à l'ouverture, jamais envoyé en clair. Une conversation verrouillée par code n'agit pas non plus ([Outcome.LOCKED]).
 *
 * Le compte de l'action est celui du GESTE : son ticket ([AccountFence.ticket]) est pris dès la session connue, doit
 * désigner le compte de la bannière, et porte toute écriture qui suit — la relecture du mode peut durer, et un autre
 * compte ouvert entre-temps ne reçoit jamais la réponse ni le commentaire tapés pour le premier (#13558).
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
    private val draftStore: ConversationDraftStore,
    private val fence: AccountFence? = null,
) {
    /** [dismissesBanner] : l'action est prise en compte, la bannière s'en va ; sinon elle reste, intacte. */
    enum class Outcome(val dismissesBanner: Boolean) {
        SENT(true),
        MARKED_READ(true),
        EMPTY(false),
        NOT_SIGNED_IN(false),
        END_TO_END(false),

        /** Le mode est inconnu et le brouillon n'a pas pu être gardé : aucune bulle condamnée ne naît, la bannière reste. */
        MODE_UNKNOWN(false),

        /**
         * Le mode de la conversation est inconnu (hors ligne) : le clair ne part pas, la réponse est gardée comme BROUILLON de
         * la conversation (#13693) et revient dans son champ à l'ouverture. La bannière reste, et le dit.
         */
        DRAFT_KEPT(false),

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
        val gesture = fence?.ticket()
        if (!isAddressedTo(user, accountId, gesture)) return Outcome.ACCOUNT_CHANGED
        if (lockStore.isLocked(conversationId)) return Outcome.LOCKED
        return guarded(gesture) {
            when (boundedVerdict(conversationId)) {
                OutboxAdmissionVerdict.ADMIT -> Unit
                OutboxAdmissionVerdict.WITHHOLD -> return@guarded Outcome.END_TO_END
                OutboxAdmissionVerdict.WAIT, OutboxAdmissionVerdict.UNREACHABLE ->
                    return@guarded keepAsDraft(conversationId, content, replyToId, gesture)
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
     * La relecture du mode borne la durée du récepteur (`goAsync`, ~10 s) : [SESSION_BUDGET_MILLIS] + [MODE_READ_BUDGET_MILLIS]
     * restent sous [GO_ASYNC_WINDOW_MILLIS] avec la marge d'écriture du brouillon. Une relecture qui n'aboutit pas à temps
     * vaut un mode inconnu (fail-closed : rien ne part en clair, le texte est gardé).
     */
    private suspend fun boundedVerdict(conversationId: String): OutboxAdmissionVerdict =
        withTimeoutOrNull(MODE_READ_BUDGET_MILLIS) { admission.verdictFor(conversationId) } ?: OutboxAdmissionVerdict.WAIT

    /**
     * Le texte reste local au compte, jamais envoyé, jamais en file. L'écriture passe par la barrière du compte
     * ([AccountFence.commit]) : un compte changé pendant la relecture n'y écrit rien, et une déconnexion qui survient
     * pendant l'écriture attend qu'elle finisse pour vider le magasin — les mots du compte parti ne restent jamais au suivant.
     */
    private suspend fun keepAsDraft(conversationId: String, content: String, replyToId: String?, gesture: AccountTicket?): Outcome {
        val kept = runCatching {
            fence.commitOrWrite(gesture) {
                val draft = KeptReplyDraft.keep(draftStore.load(conversationId), conversationId, content, replyToId, java.time.Instant.now().toString())
                draftStore.save(draft)
            }
        }.onFailure {
            if (it is CancellationException) throw it
            Timber.w(it, "Offline reply could not be kept as a draft")
        }
        return when {
            kept.isFailure -> Outcome.MODE_UNKNOWN
            kept.getOrNull() == null -> Outcome.ACCOUNT_CHANGED
            else -> Outcome.DRAFT_KEPT
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
        val gesture = fence?.ticket()
        if (!isAddressedTo(user, accountId, gesture)) return Outcome.ACCOUNT_CHANGED
        return guarded(gesture) {
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
        val gesture = fence?.ticket()
        if (!isAddressedTo(user, accountId, gesture)) return Outcome.ACCOUNT_CHANGED
        if (lockStore.isLocked(conversationId)) return Outcome.LOCKED
        return guarded(gesture) {
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

    /** La bannière s'adresse au compte connecté, et c'est aussi le compte sous lequel la file écrira. */
    private fun isAddressedTo(user: MeeshyUser, accountId: String?, gesture: AccountTicket?): Boolean =
        (accountId == null || accountId == user.id) && (gesture == null || gesture.ownerId == user.id)

    private suspend fun guarded(gesture: AccountTicket?, action: suspend () -> Outcome): Outcome = try {
        withAccountTicket(gesture) { action() }
    } catch (closed: AccountClosedException) {
        Timber.w("Notification action dropped: its account closed")
        Outcome.ACCOUNT_CHANGED
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Exception) {
        Timber.w(failure, "Notification action failed")
        Outcome.FAILED
    }

    internal companion object {
        const val SESSION_BUDGET_MILLIS = 6_000L
        const val MODE_READ_BUDGET_MILLIS = 2_500L

        /** Le délai que le système laisse à un récepteur resté ouvert par `goAsync()` (broadcast de premier plan). */
        const val GO_ASYNC_WINDOW_MILLIS = 10_000L
    }
}
