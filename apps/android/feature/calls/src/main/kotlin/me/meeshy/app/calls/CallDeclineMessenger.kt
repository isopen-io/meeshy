package me.meeshy.app.calls

import android.content.Context
import android.widget.Toast
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.conversationOrNull
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.friend.OutboxFlushScheduler
import me.meeshy.sdk.lang.ComposeLanguageDetector
import me.meeshy.sdk.lang.LanguageIdentifying
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.model.call.CallDeclineReplyPlan
import me.meeshy.sdk.model.call.CallDeclineReplyRule
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.feature.calls.R
import me.meeshy.sdk.session.SessionRepository
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/** Ce qu'est devenu un message de refus (miroir de `CallDeclineMessenger.send`, iOS). */
sealed interface CallDeclineOutcome {
    /** Bulle optimiste posée et envoi mis en file : l'outbox le livrera, hors ligne compris. */
    data object Queued : CallDeclineOutcome

    /** Conversation chiffrée de bout en bout : rien n'est écrit ni envoyé en clair (#12641, #13067). */
    data object EndToEndRefused : CallDeclineOutcome

    /** Pas de session, pas de conversation, ou la mise en file a échoué. */
    data object Failed : CallDeclineOutcome
}

/**
 * Envoie le message d'un refus d'appel dans la conversation directe de l'appelant, par la file
 * d'envoi existante (bulle optimiste puis `SEND_MESSAGE` sur la voie de la conversation). Il vit
 * au-delà de l'écran d'appel, qui se ferme dès le refus : l'envoi a sa propre portée.
 *
 * Fail-closed vers une conversation chiffrée de bout en bout — le registre du compte et le mode
 * de la ligne en cache sont lus AVANT toute écriture, et une conversation absente du cache est
 * relue au serveur ; l'Android natif ne sait pas sceller. Le refus est dit à l'utilisateur
 * ([notifyRefusal], un toast : l'écran d'appel est déjà fermé — iOS `FeedbackToastManager`).
 */
@Singleton
class CallDeclineMessenger internal constructor(
    private val messages: MessageRepository,
    private val conversations: ConversationRepository,
    private val session: SessionRepository,
    private val ledger: EndToEndRegimeLedger,
    private val flush: OutboxFlushScheduler,
    private val scope: CoroutineScope,
    private val notifyRefusal: suspend () -> Unit,
) {
    @Inject
    constructor(
        messages: MessageRepository,
        conversations: ConversationRepository,
        session: SessionRepository,
        ledger: EndToEndRegimeLedger,
        flush: OutboxFlushScheduler,
        @ApplicationContext context: Context,
    ) : this(
        messages, conversations, session, ledger, flush,
        CoroutineScope(SupervisorJob() + Dispatchers.Default),
        notifyRefusal = {
            withContext(Dispatchers.Main) {
                Toast.makeText(context, R.string.call_decline_end_to_end_refused, Toast.LENGTH_LONG).show()
            }
        },
    )

    /** Lance l'envoi hors de l'écran appelant ; le résultat n'attend personne. */
    fun sendInBackground(peerId: String, conversationId: String, text: String) {
        scope.launch { send(peerId, conversationId, text) }
    }

    suspend fun send(peerId: String, conversationId: String, text: String): CallDeclineOutcome {
        val user = session.currentUser.value ?: return CallDeclineOutcome.Failed.also {
            Timber.w("decline reply without an active user — ignoring")
        }
        val target = conversationId.ifBlank { directWith(peerId) }
        val language = ComposeLanguageDetector.originalLanguageAtSend(
            text = text,
            manual = null,
            senderLanguage = LanguageResolver.resolveUserLanguage(user),
            identifier = LanguageIdentifying.Unavailable,
        )
        val plan = CallDeclineReplyRule.plan(true, target, text, language) ?: return CallDeclineOutcome.Failed
        if (isSealed(plan)) {
            Timber.w("decline reply refused before transport: end-to-end conversation")
            notifyRefusal()
            return CallDeclineOutcome.EndToEndRefused
        }
        return try {
            messages.sendOptimistic(
                conversationId = plan.conversationId,
                content = plan.content,
                originalLanguage = plan.originalLanguage.orEmpty().ifBlank { language },
                sender = user,
            )
            flush.schedule()
            CallDeclineOutcome.Queued
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w(failure, "decline reply could not be queued")
            CallDeclineOutcome.Failed
        }
    }

    private suspend fun directWith(peerId: String): String? {
        if (peerId.isBlank()) return null
        return conversations.directConversationWith(peerId).conversationOrNull?.id
    }

    private suspend fun isSealed(plan: CallDeclineReplyPlan): Boolean {
        if (ledger.isSealed(plan.conversationId)) return true
        val known = conversations.cachedById(plan.conversationId)
            ?: (conversations.getById(plan.conversationId) as? NetworkResult.Success)?.data
        return EndToEndRegime.isEndToEnd(known?.encryptionMode)
    }
}
