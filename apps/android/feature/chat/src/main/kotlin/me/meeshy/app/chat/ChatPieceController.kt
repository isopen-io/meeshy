package me.meeshy.app.chat

import androidx.work.WorkManager
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.conversation.MessageAttachmentRemover
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.PieceRemoval
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.piece.MessagePieceTarget
import me.meeshy.sdk.model.piece.PieceDeletion
import me.meeshy.sdk.outbox.ConversationPlaintextVerdict
import me.meeshy.sdk.outbox.OutboxAdmissionVerdict
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository

/** Ce qu'un geste sur une pièce n'a pas pu faire — l'écran le dit, dans la langue du lecteur. */
enum class PieceFailure { REMOVE }

/**
 * **Les gestes d'une pièce SEULE qui touchent le serveur** (#13596, miroir de `toggleAttachmentReaction` et
 * `deleteAttachment`, iOS) : réagir à la pièce affichée, la supprimer. Le transfert passe par la feuille de partage
 * ([ChatForwardController.openPiece]), « Enregistrer » par [ChatFileDownloadController].
 *
 * - **Réagir** : optimiste dans Room, confirmé par la socket (`attachment:reaction-add|remove`), défait par le geste
 *   inverse sur un refus ([ChatRealtimeController.toggleAttachmentReaction]). Jamais sur une pièce protégée ni sans le
 *   droit d'écrire.
 * - **Supprimer** : seulement SA pièce, sur un message accusé. Une pièce parmi d'autres (ou un message qui garde du
 *   texte) ne perd que la pièce, qui revient à sa place si la passerelle refuse ; la dernière pièce d'un message sans
 *   texte supprime le message entier, par le circuit ordinaire.
 *
 * **Ce qui ÉCRIT du clair hors de l'outbox suit SA loi du clair** (#13803) : [ConversationPlaintextVerdict] juge la
 * conversation de l'écran ET celle du message (registre, mode en cache, relecture d'un mode inconnu) AVANT tout optimiste et
 * tout envoi — Room peut encore dire `server` d'une conversation que le registre sait chiffrée.
 *
 * - **Ajouter** une réaction : seule une conversation connue claire la reçoit ; chiffrée, inconnue ou illisible à temps,
 *   rien ne part.
 * - **Retirer** une réaction part toujours : un geste qui efface se juge sur la ligne, l'emoji est déjà connu de la
 *   passerelle (`AttachmentReactionService.removeAttachmentReaction`).
 * - **Supprimer le message entier** passe par l'outbox, qui juge elle-même un mode inconnu : seuls un régime chiffré ou une
 *   conversation que la passerelle ne servira jamais le retiennent ici.
 * - **Retirer une pièce parmi d'autres** ne part que vers une conversation connue claire.
 *
 * Un geste retenu de suppression le dit au lecteur. Un second toucher pendant le vol du premier est inerte.
 */
class ChatPieceController @Inject constructor(
    private val remover: MessageAttachmentRemover,
    private val realtime: ChatRealtimeController,
    private val messageRepository: MessageRepository,
    private val workManager: WorkManager,
    private val sessionRepository: SessionRepository,
    private val verdict: ConversationPlaintextVerdict,
) : ChatController {

    private var host: ChatControllerHost? = null

    /** Gestes encore en vol : `message|pièce|emoji` pour une réaction, `message|pièce` pour une suppression. */
    private val reactionsInFlight = mutableSetOf<String>()
    private val deletionsInFlight = mutableSetOf<String>()
    private val _failures = MutableSharedFlow<PieceFailure>(extraBufferCapacity = 4)

    /** Les échecs à dire à l'utilisateur ; l'écran les collecte pendant qu'il est ouvert. */
    val failures: SharedFlow<PieceFailure> = _failures.asSharedFlow()

    override fun attach(host: ChatControllerHost) {
        this.host = host
    }

    override fun detach() {
        host = null
    }

    private fun carrier(host: ChatControllerHost, messageId: String): ApiMessage? =
        host.messages.value.firstOrNull { it.message.id == messageId }?.message

    private fun ApiMessage.piece(attachmentId: String): ApiMessageAttachment? = attachments.firstOrNull { it.id == attachmentId }

    /** La conversation de l'écran et celle que porte le message : chaque geste jugé les juge TOUTES. */
    private fun conversationsOf(host: ChatControllerHost, message: ApiMessage): List<String> =
        listOf(host.conversationId, message.conversationId).filter { it.isNotBlank() }.distinct()

    /** Relecture bornée : un mode qui ne se lit pas à temps, ou dont la lecture échoue, n'a pas de verdict (`null`). */
    private suspend fun verdictOf(conversationId: String): OutboxAdmissionVerdict? = try {
        withTimeoutOrNull(MODE_READ_BUDGET_MILLIS) { verdict.verdictFor(conversationId) }
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        null
    }

    /** Toutes les conversations sont connues claires : sans verdict, rien ne part. */
    private suspend fun allAdmit(conversations: List<String>): Boolean =
        conversations.isNotEmpty() && conversations.all { verdictOf(it) == OutboxAdmissionVerdict.ADMIT }

    /** Aucune n'est connue chiffrée ni définitivement injoignable : l'inconnu reste à l'outbox, qui le juge. */
    private suspend fun noneRefuses(conversations: List<String>): Boolean =
        conversations.none { verdictOf(it) in REFUSALS }

    /** Pose ou retire [emoji] sur la pièce : retire si ce lecteur l'a déjà posé. */
    fun react(messageId: String, attachmentId: String, emoji: String) {
        val current = host ?: return
        val message = carrier(current, messageId) ?: return
        val piece = message.piece(attachmentId) ?: return
        if (MessagePieceTarget.isProtected(piece, message)) return
        val adding = emoji !in piece.currentUserReactions.orEmpty()
        if (adding && !current.uiState.value.viewerMayWrite) return
        val key = "$messageId|$attachmentId|$emoji"
        if (!reactionsInFlight.add(key)) return
        val conversations = conversationsOf(current, message)
        current.scope.launch {
            try {
                if (adding && !allAdmit(conversations)) return@launch
                realtime.toggleAttachmentReaction(messageId, attachmentId, emoji, adding)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                // L'optimiste est déjà défait par le contrôleur du temps réel ; une pill qui revient suffit.
            } finally {
                reactionsInFlight.remove(key)
            }
        }
    }

    /** Supprime la pièce visée — jamais une voisine ; un lot sans visée ne supprime rien. */
    fun delete(messageId: String, attachmentId: String) {
        val current = host ?: return
        val message = carrier(current, messageId) ?: return
        if (!PieceDeletion.mayDelete(message, sessionRepository.currentUser.value?.id, current.uiState.value.isEndToEnd)) return
        val plan = PieceDeletion.plan(message, attachmentId)
        if (plan == PieceDeletion.Plan.Nothing) return
        val key = "$messageId|$attachmentId"
        if (!deletionsInFlight.add(key)) return
        val conversations = conversationsOf(current, message)
        current.scope.launch {
            try {
                if (mayCarryOut(plan, conversations)) carryOut(messageId, plan) else _failures.emit(PieceFailure.REMOVE)
            } finally {
                deletionsInFlight.remove(key)
            }
        }
    }

    private suspend fun mayCarryOut(plan: PieceDeletion.Plan, conversations: List<String>): Boolean = when (plan) {
        PieceDeletion.Plan.Nothing -> false
        PieceDeletion.Plan.DeleteMessage -> noneRefuses(conversations)
        // `DELETE /attachments/:id` part hors de l'outbox ; la passerelle le juge sur la ligne, mais cet appareil n'a pas
        // encore la frontière d'ère (#13791) : hors d'une conversation connue claire, rien ne part (#13804).
        is PieceDeletion.Plan.RemovePiece -> allAdmit(conversations)
    }

    private suspend fun carryOut(messageId: String, plan: PieceDeletion.Plan) {
        when (plan) {
            PieceDeletion.Plan.Nothing -> Unit
            PieceDeletion.Plan.DeleteMessage -> {
                try {
                    if (messageRepository.deleteOptimistic(messageId)) workManager.enqueue(OutboxFlushWorker.buildRequest())
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    _failures.emit(PieceFailure.REMOVE)
                }
            }
            is PieceDeletion.Plan.RemovePiece -> {
                try {
                    if (remover.remove(messageId, plan.attachmentId) == PieceRemoval.FAILED) _failures.emit(PieceFailure.REMOVE)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    _failures.emit(PieceFailure.REMOVE)
                }
            }
        }
    }

    private companion object {
        const val MODE_READ_BUDGET_MILLIS = 5_000L
        val REFUSALS = setOf(OutboxAdmissionVerdict.WITHHOLD, OutboxAdmissionVerdict.UNREACHABLE)
    }
}
