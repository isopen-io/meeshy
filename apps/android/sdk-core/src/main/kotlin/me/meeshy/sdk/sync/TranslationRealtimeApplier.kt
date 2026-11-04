package me.meeshy.sdk.sync

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.socket.MessageSocketManager

/**
 * Les ENRICHISSEMENTS du Prisme du relais permanent : traductions de texte, transcriptions et pistes audio
 * traduites se fusionnent dans la ligne de message par les règles de fusion existantes
 * (`MessageTranslationMerge`, `AttachmentTranscriptionMerge`, `AttachmentAudioTranslationMerge`) :
 * idempotentes, une traduction déjà présente n'est jamais régressée, et rien n'est élu ici — la langue
 * servie reste l'affaire du résolveur du Prisme à l'affichage, jamais de la première traduction arrivée.
 * Voie `ENRICHMENT` : un rattrapage de traduction lent ne retient aucun message.
 */
@Singleton
class TranslationRealtimeApplier @Inject constructor(
    private val socket: MessageSocketManager,
    private val messages: MessageRepository,
) : RealtimeCacheApplier {

    override fun subscribe(registrar: RelayRegistrar) {
        val lane = OrderedEventLane.Family.ENRICHMENT
        registrar.relay(socket.translationReceived, lane) {
            messages.applyTranslation(it.messageId, it.targetLanguage, it.translatedContent)
        }
        registrar.relay(socket.transcriptionReady, lane) { event ->
            val transcript = event.transcription
            messages.applyTranscription(
                event.messageId, event.attachmentId, transcript.text, transcript.language, transcript.confidence, transcript.durationMs,
                transcript.segments, transcript.speakerCount,
            )
        }
        registrar.relay(socket.audioTranslationReady, lane) { event ->
            val audio = event.translatedAudio
            messages.applyAudioTranslation(
                event.messageId, event.attachmentId, event.language, audio.url, audio.transcription,
                audio.durationMs, audio.format, audio.cloned, audio.quality, audio.voiceModelId, audio.ttsModel, audio.segments,
            )
        }
    }
}
