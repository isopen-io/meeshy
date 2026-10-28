package me.meeshy.app.chat

import androidx.work.WorkManager
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.MessageAttachmentRemover
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.PieceRemoval
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.piece.MessagePieceTarget
import me.meeshy.sdk.model.piece.PieceDeletion
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
 */
class ChatPieceController @Inject constructor(
    private val remover: MessageAttachmentRemover,
    private val realtime: ChatRealtimeController,
    private val messageRepository: MessageRepository,
    private val workManager: WorkManager,
    private val sessionRepository: SessionRepository,
) : ChatController {

    private var host: ChatControllerHost? = null
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

    /** Pose ou retire [emoji] sur la pièce : retire si ce lecteur l'a déjà posé. */
    fun react(messageId: String, attachmentId: String, emoji: String) {
        val current = host ?: return
        val state = current.uiState.value
        if (!state.viewerMayWrite) return
        val message = carrier(current, messageId) ?: return
        val piece = message.piece(attachmentId) ?: return
        if (MessagePieceTarget.isProtected(piece, message)) return
        val adding = emoji !in piece.currentUserReactions.orEmpty()
        current.scope.launch {
            try {
                realtime.toggleAttachmentReaction(messageId, attachmentId, emoji, adding)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                // L'optimiste est déjà défait par le contrôleur du temps réel ; une pill qui revient suffit.
            }
        }
    }

    /** Supprime la pièce visée — jamais une voisine ; un lot sans visée ne supprime rien. */
    fun delete(messageId: String, attachmentId: String) {
        val current = host ?: return
        val message = carrier(current, messageId) ?: return
        if (!PieceDeletion.mayDelete(message, sessionRepository.currentUser.value?.id, current.uiState.value.isEndToEnd)) return
        when (val plan = PieceDeletion.plan(message, attachmentId)) {
            PieceDeletion.Plan.Nothing -> Unit
            PieceDeletion.Plan.DeleteMessage -> current.scope.launch {
                try {
                    if (messageRepository.deleteOptimistic(messageId)) workManager.enqueue(OutboxFlushWorker.buildRequest())
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    _failures.emit(PieceFailure.REMOVE)
                }
            }
            is PieceDeletion.Plan.RemovePiece -> current.scope.launch {
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
}
