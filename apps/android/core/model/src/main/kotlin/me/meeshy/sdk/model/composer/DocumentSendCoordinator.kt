package me.meeshy.sdk.model.composer

import kotlinx.coroutines.CancellationException

/** La porte par laquelle le document part : le fil montre l'envoi, une porte sans fil l'enfile seulement. */
sealed interface DocumentDoor {
    /** Le fil est monté : [onQueued] lui remet l'identifiant local de la ligne dès qu'elle est prise. */
    class Feed(val onQueued: (cmid: String) -> Unit) : DocumentDoor

    /** Aucun fil sous la porte (tiroir, partage) : seul l'envoi durable est enfilé, sans erreur ni aperçu. */
    data object Wireless : DocumentDoor
}

/** Le dépôt durable de l'envoi : rend l'identifiant local de la ligne, ou lève si l'appareil ne peut pas la prendre. */
fun interface DocumentDurableSink {
    suspend fun enqueue(intent: PublishIntent): String
}

/** La phrase qui dit un refus en clair. */
enum class DocumentRefusalCopy { PUBLISH_ERROR, FORMAT_UNSUPPORTED }

val ComposerDocumentSendRefusal.copyKey: DocumentRefusalCopy
    get() = when (this) {
        is ComposerDocumentSendRefusal.WrongFormat -> DocumentRefusalCopy.FORMAT_UNSUPPORTED
        else -> DocumentRefusalCopy.PUBLISH_ERROR
    }

sealed interface DocumentSendOutcome {
    /** Enfilé durablement (pas « livré »). La porte peut se fermer. */
    data class Accepted(val cmid: String) : DocumentSendOutcome

    /** Refusé EN CLAIR : la composition est conservée, la porte reste ouverte. */
    data class Refused(val refusal: ComposerDocumentSendRefusal) : DocumentSendOutcome {
        val copyKey: DocumentRefusalCopy get() = refusal.copyKey
    }
}

/**
 * Le chemin d'envoi d'un document, une seule fois pour toutes les portes — miroir d'iOS `DocumentComposerDoor.publishDocument` et
 * `ComposerDocumentDurablePublisher`. Le plan décide si le brouillon part ; les actifs de scène sont emportés dans le brouillon
 * AVANT le plan (un son seul est de la matière) ; le dépôt durable fait le reste. Il ne ferme jamais la porte lui-même.
 */
class DocumentSendCoordinator(private val sink: DocumentDurableSink) {

    suspend fun send(
        draft: ComposerDocumentDraft,
        door: DocumentDoor,
        carried: CarriedSceneAssets = CarriedSceneAssets.EMPTY,
    ): DocumentSendOutcome {
        val carrying = carried.carriedBy(draft)
        val plan = ComposerDocumentSendPlan.plan(carrying.copy(carriesSceneObject = carrying.carriesSceneObject || carried.media.isNotEmpty()))
        if (plan is ComposerDocumentSendPlan.Refuse) return DocumentSendOutcome.Refused(plan.refusal)
        val cmid = try {
            sink.enqueue(carrying.toPublishIntent())
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            val message = failure.message.orEmpty()
            return DocumentSendOutcome.Refused(
                if (message.isEmpty()) ComposerDocumentSendRefusal.PublisherSilent
                else ComposerDocumentSendRefusal.PublisherRejected(message),
            )
        }
        (door as? DocumentDoor.Feed)?.onQueued?.invoke(cmid)
        return DocumentSendOutcome.Accepted(cmid)
    }
}
