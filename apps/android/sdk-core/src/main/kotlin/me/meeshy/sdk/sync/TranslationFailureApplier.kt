package me.meeshy.sdk.sync

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.AudioTranslationFailedEvent
import me.meeshy.sdk.model.AudioTranslationStage
import me.meeshy.sdk.model.TranscriptionFailedEvent
import me.meeshy.sdk.model.TranslationFailedEvent
import me.meeshy.sdk.model.toFailureEntry
import me.meeshy.sdk.socket.ConversationSocketEventsManager
import me.meeshy.sdk.socket.MessageSocketManager

/**
 * Pose l'état « traduction impossible » d'un message quand la passerelle annonce un échec
 * (`translation:failed`, `audio:translation-failed`, `audio:transcription-failed`), et l'EFFACE dès que le
 * succès correspondant arrive (traduction, transcription, piste audio progressive ou terminée). Aucune
 * mutation ici ne touche au contenu du message : le Prisme n'est jamais déplacé par un échec.
 */
@Singleton
class TranslationFailureApplier @Inject constructor(
    private val socket: MessageSocketManager,
    private val conversationEvents: ConversationSocketEventsManager,
    private val store: TranslationFailureStore,
) : RealtimeCacheApplier {

    override fun subscribe(registrar: RelayRegistrar) {
        val lane = OrderedEventLane.Family.ENRICHMENT
        /* `answeredLanguages` et non `usable` : ce qui solde une attente est l'ARRIVÉE d'une
           réponse, pas sa qualité. Une trame à texte vide laisserait sinon l'état « traduction en
           cours » allumé pour toujours. */
        registrar.relay(socket.translationReceived, lane) { event ->
            event.answeredLanguages.forEach { store.textTranslated(event.messageId, it) }
        }
        registrar.relay(socket.transcriptionReady, lane) { store.transcribed(it.messageId, it.attachmentId) }
        registrar.relay(socket.audioTranslationReady, lane) { store.audioTranslated(it.messageId, it.attachmentId, it.language) }
        registrar.relay(conversationEvents.events, lane) { event ->
            when (event) {
                is TranslationFailedEvent -> store.failed(event.toFailureEntry())
                is AudioTranslationFailedEvent -> store.failed(event.toFailureEntry())
                is TranscriptionFailedEvent -> store.failed(event.toFailureEntry())
                is AudioTranslationStage ->
                    store.audioTranslated(event.event.messageId, event.event.attachmentId, event.event.language)
                else -> Unit
            }
        }
    }
}
