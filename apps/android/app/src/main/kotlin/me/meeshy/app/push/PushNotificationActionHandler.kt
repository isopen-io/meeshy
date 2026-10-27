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
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.outbox.EndToEndOutboxAdmission
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Ce que font les boutons « Répondre » et « Marquer comme lu » d'une bannière, hors de l'écran.
 * La réponse passe par la file d'envoi existante ([MessageRepository.sendOptimistic] : la bulle
 * naît `SENDING`, la mutation rejoint la file de sa conversation, rejouée au retour du réseau) ;
 * « lu » par [ConversationRepository.markReadOptimistic].
 *
 * Fail-closed en conversation chiffrée de bout en bout : ce natif ne sait pas chiffrer, donc
 * rien ne part en clair ([Outcome.END_TO_END]) — la même garde que le drainer de la file
 * ([EndToEndOutboxAdmission]), lue AVANT de créer une bulle condamnée.
 */
@Singleton
class PushNotificationActionHandler @Inject constructor(
    @ApplicationContext private val context: Context,
    private val sessionRepository: SessionRepository,
    private val messageRepository: MessageRepository,
    private val conversationRepository: ConversationRepository,
    private val admission: EndToEndOutboxAdmission,
) {
    /** [dismissesBanner] : l'action est prise en compte, la bannière s'en va ; sinon elle reste, intacte. */
    enum class Outcome(val dismissesBanner: Boolean) {
        SENT(true),
        MARKED_READ(true),
        EMPTY(false),
        NOT_SIGNED_IN(false),
        END_TO_END(false),
        FAILED(false),
    }

    suspend fun reply(conversationId: String, text: String): Outcome {
        val content = text.trim()
        if (content.isEmpty()) return Outcome.EMPTY
        val user = signedInUser() ?: return Outcome.NOT_SIGNED_IN
        return guarded {
            if (admission.isConversationSealed(conversationId)) return@guarded Outcome.END_TO_END
            messageRepository.sendOptimistic(
                conversationId = conversationId,
                content = content,
                originalLanguage = user.systemLanguage ?: LanguageResolver.FALLBACK_LANGUAGE,
                sender = user,
            )
            WorkManager.getInstance(context).enqueue(OutboxFlushWorker.buildRequest())
            Outcome.SENT
        }
    }

    suspend fun markRead(conversationId: String): Outcome {
        if (signedInUser() == null) return Outcome.NOT_SIGNED_IN
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
