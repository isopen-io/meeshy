package me.meeshy.sdk.share

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.conversation.MessageForwardService
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.share.OutgoingShare
import me.meeshy.sdk.model.share.ShareFailure
import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.outbox.OutOfThreadAdmission
import me.meeshy.sdk.outbox.OutOfThreadSendGate
import me.meeshy.sdk.outbox.OutboxIds

/** L'issue de l'envoi vers UNE ligne : jamais un seul verdict pour tout le lot. */
sealed interface ShareDeliveryOutcome {
    /** Entré dans la file durable, le réseau est là : part tout de suite. */
    data class Sent(val conversationId: String) : ShareDeliveryOutcome

    /** Hors ligne (ou mode de la conversation à relire) : dans la file durable, part au retour du réseau. */
    data class Queued(val conversationId: String) : ShareDeliveryOutcome

    data class Failed(val failure: ShareFailure) : ShareDeliveryOutcome
}

/** Ce que le partage envoie : les messages dans l'ordre (légende comprise, déjà placée par le plan) et qui les envoie. */
data class ShareDispatchRequest(
    /** L'identité du geste « Envoyer » : avec la destination et le rang du message, elle fixe le `clientMessageId`. */
    val shareId: String,
    val posts: List<OutgoingShare>,
    val sender: MeeshyUser,
)

/** Où une ligne se résout : une conversation, ou un refus dit à la ligne. */
sealed interface ShareTarget {
    data class Ready(val conversationId: String) : ShareTarget
    data class Refused(val failure: ShareFailure) : ShareTarget
}

/**
 * Retrouve ou crée la conversation d'une ligne, À L'ENVOI jamais à la sélection (une personne sans conversation en reçoit
 * une, la création étant idempotente côté passerelle).
 */
fun interface ShareTargetResolver {
    suspend fun resolve(recipient: ShareRecipient, sender: MeeshyUser): ShareTarget
}

/** Une ligne résolue : prête à recevoir (avec le verdict d'admission) ou refusée, la raison dite à la ligne. */
sealed interface ShareDestination {
    data class Open(val conversationId: String, val admission: OutOfThreadAdmission) : ShareDestination
    data class Refused(val failure: ShareFailure) : ShareDestination
}

interface ShareDispatching {
    /**
     * Envoie vers chaque ligne de [recipients] ; [onOutcome] reçoit l'issue de chacune dès qu'elle est connue.
     * Rend l'issue par `ShareRecipient.id`.
     */
    suspend fun dispatch(
        request: ShareDispatchRequest,
        recipients: List<ShareRecipient>,
        onOutcome: suspend (ShareRecipient, ShareDeliveryOutcome) -> Unit = { _, _ -> },
    ): Map<String, ShareDeliveryOutcome>
}

/**
 * **L'envoi réel du partage** (#14969, miroir de `LiveShareDispatcher`, iOS) sur l'outbox durable.
 *
 * - **Une issue par ligne** : un échec n'arrête pas les autres destinataires ; le premier échec arrête la série de CE
 *   destinataire, les messages partant dans l'ordre.
 * - **Hors ligne = Queued** : chaque message est une bulle locale plus une entrée d'outbox durable, rejouée au retour du
 *   réseau, feuille fermée ou non. Chaque cible a son `clientMessageId` DÉRIVÉ de (geste, conversation, rang) :
 *   stable au rejeu, la passerelle déduplique.
 * - **Chiffré = refus fail-closed** : le mode de CHAQUE conversation rendue est relu ([OutOfThreadSendGate]) avant qu'une
 *   bulle ne naisse ; chiffrée de bout en bout (Android ne chiffre pas encore), rien n'est posté ni mis en file.
 */
@Singleton
class ShareDispatcher @Inject constructor(
    private val targets: ShareTargetResolver,
    private val gate: OutOfThreadSendGate,
    private val forwards: MessageForwardService,
    private val network: NetworkMonitor,
) : ShareDispatching {

    /**
     * Où chaque ligne se résout AVANT qu'un octet ne parte : la conversation ouverte (avec le verdict du mode de chiffrement
     * relu) ou le refus à lui dire. L'envoi durable écrit sa fiche entre ce temps et celui de l'envoi.
     */
    suspend fun destinationsOf(recipients: List<ShareRecipient>, sender: MeeshyUser): Map<String, ShareDestination> {
        val resolved = recipients.associate { it.id to resolve(it, sender) }
        val admissions = admissionsOf(resolved.values.filterIsInstance<ShareTarget.Ready>().map { it.conversationId })
        return resolved.mapValues { (_, target) -> destinationOf(target, admissions) }
    }

    private fun destinationOf(target: ShareTarget, admissions: Map<String, OutOfThreadAdmission>): ShareDestination = when (target) {
        is ShareTarget.Refused -> ShareDestination.Refused(target.failure)
        is ShareTarget.Ready -> when (val admission = admissions[target.conversationId]) {
            null -> ShareDestination.Refused(ShareFailure.GENERIC)
            OutOfThreadAdmission.END_TO_END -> ShareDestination.Refused(ShareFailure.SEALED_DESTINATION)
            OutOfThreadAdmission.UNREACHABLE -> ShareDestination.Refused(ShareFailure.UNREACHABLE)
            OutOfThreadAdmission.SEND, OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN -> ShareDestination.Open(target.conversationId, admission)
        }
    }

    override suspend fun dispatch(
        request: ShareDispatchRequest,
        recipients: List<ShareRecipient>,
        onOutcome: suspend (ShareRecipient, ShareDeliveryOutcome) -> Unit,
    ): Map<String, ShareDeliveryOutcome> {
        val resolved = recipients.associate { it.id to resolve(it, request.sender) }
        val admissions = admissionsOf(resolved.values.filterIsInstance<ShareTarget.Ready>().map { it.conversationId })
        val outcomes = LinkedHashMap<String, ShareDeliveryOutcome>()
        recipients.forEach { recipient ->
            val outcome = deliver(request, resolved.getValue(recipient.id), admissions)
            outcomes[recipient.id] = outcome
            onOutcome(recipient, outcome)
        }
        return outcomes
    }

    private suspend fun resolve(recipient: ShareRecipient, sender: MeeshyUser): ShareTarget = try {
        targets.resolve(recipient, sender)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (e: Exception) {
        ShareTarget.Refused(ShareFailure.GENERIC)
    }

    private suspend fun admissionsOf(conversationIds: List<String>): Map<String, OutOfThreadAdmission> = try {
        gate.admitAll(conversationIds)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (e: Exception) {
        emptyMap()
    }

    private suspend fun deliver(
        request: ShareDispatchRequest,
        target: ShareTarget,
        admissions: Map<String, OutOfThreadAdmission>,
    ): ShareDeliveryOutcome = when (target) {
        is ShareTarget.Refused -> ShareDeliveryOutcome.Failed(target.failure)
        is ShareTarget.Ready -> when (val admission = admissions[target.conversationId]) {
            null -> ShareDeliveryOutcome.Failed(ShareFailure.GENERIC)
            OutOfThreadAdmission.END_TO_END -> ShareDeliveryOutcome.Failed(ShareFailure.SEALED_DESTINATION)
            OutOfThreadAdmission.UNREACHABLE -> ShareDeliveryOutcome.Failed(ShareFailure.UNREACHABLE)
            OutOfThreadAdmission.SEND, OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN -> post(request, target.conversationId, admission)
        }
    }

    /** Les messages partent dans l'ordre ; le premier échec arrête la série de ce destinataire. */
    private suspend fun post(request: ShareDispatchRequest, conversationId: String, admission: OutOfThreadAdmission): ShareDeliveryOutcome {
        try {
            request.posts.forEachIndexed { index, post ->
                forwards.post(post, conversationId, request.sender, clientIdOf(request.shareId, conversationId, index))
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (e: Exception) {
            return ShareDeliveryOutcome.Failed(ShareFailure.GENERIC)
        }
        val waits = !network.isOnline.value || admission == OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN
        return if (waits) ShareDeliveryOutcome.Queued(conversationId) else ShareDeliveryOutcome.Sent(conversationId)
    }

    companion object {
        /** Le `clientMessageId` du message de rang [index] du geste [shareId] vers [conversationId] : stable au rejeu. */
        fun clientIdOf(shareId: String, conversationId: String, index: Int): String =
            OutboxIds.derivedCid("share|$shareId|$conversationId|$index")
    }
}
