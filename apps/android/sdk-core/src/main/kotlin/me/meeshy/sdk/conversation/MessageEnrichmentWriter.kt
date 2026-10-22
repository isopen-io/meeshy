package me.meeshy.sdk.conversation

import me.meeshy.sdk.model.AttachmentAudioTranslationMerge
import me.meeshy.sdk.model.AttachmentTranscriptionMerge
import me.meeshy.sdk.model.MessageTranslationMerge
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TranslateRequest
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.net.apiCall

/**
 * What the Prisme adds to an already-cached message: text translations, audio transcriptions
 * and cloned-voice audio translations, whether pushed by the socket or pulled on demand. One
 * domain — derived server truth merged into the row, never a local mutation to replay, so no
 * outbox. Every merge is idempotent: a no-op merge leaves the cached row untouched.
 */
internal class MessageEnrichmentWriter(
    private val updater: CachedMessageUpdater,
    private val translationApi: TranslationApi,
) {

    /**
     * Applies a `message:translation` socket update to the
     * cache — the translated content is upserted into the message's translations so
     * the Prisme renders it live (progressive translation). A no-op merge (blank, duplicate,
     * or deleted target) leaves the cached row untouched.
     */
    suspend fun applyTranslation(messageId: String, targetLanguage: String, translatedContent: String) {
        updater.update(messageId, requireSynced = false) { message ->
            MessageTranslationMerge.mergeTranslation(message, targetLanguage, translatedContent) ?: message
        }
    }

    /**
     * Applies a `transcription:ready` socket update to the cache — the transcription
     * is upserted onto the matching audio attachment so the Prisme renders it live
     * (progressive transcription). A no-op merge (blank, duplicate, no target, or deleted)
     * leaves the cached row untouched.
     */
    suspend fun applyTranscription(
        messageId: String,
        attachmentId: String?,
        text: String,
        language: String?,
        confidence: Double?,
        durationMs: Long?,
    ) {
        updater.update(messageId, requireSynced = false) { message ->
            AttachmentTranscriptionMerge.mergeTranscription(
                message,
                attachmentId,
                text,
                language,
                confidence,
                durationMs,
            ) ?: message
        }
    }

    /**
     * Applies an `audio:translation-ready` socket update to the cache — the cloned-voice
     * translation is upserted onto the matching audio attachment so the open bubble can
     * play the viewer's-language voice live (progressive voice translation). A no-op merge
     * (blank url, blank language, duplicate, no target, or deleted) leaves the cached row
     * untouched.
     */
    suspend fun applyAudioTranslation(
        messageId: String,
        attachmentId: String?,
        language: String,
        url: String,
        transcription: String,
        durationMs: Long?,
        format: String?,
        cloned: Boolean,
        quality: Double?,
        voiceModelId: String?,
        ttsModel: String?,
    ) {
        updater.update(messageId, requireSynced = false) { message ->
            AttachmentAudioTranslationMerge.mergeAudioTranslation(
                message,
                attachmentId,
                language,
                url,
                transcription,
                durationMs,
                format,
                cloned,
                quality,
                voiceModelId,
                ttsModel,
            ) ?: message
        }
    }

    /**
     * On-demand translation (Prisme, pull side): the viewer tapped a configured
     * language the message has no content for yet. Blocking-translates the
     * message's original text into [targetLanguage] and upserts the result into
     * the cache via [MessageTranslationMerge] so the open bubble can switch to it
     * — the same live re-render path as an inbound `message:translation`.
     *
     * Returns `true` only when a non-blank translation was actually stored. Inert
     * (`false`, nothing stored) when the message is unknown, deleted, has no source
     * text, the target is blank, the network call fails, the translator returns a
     * blank string, or the translation already matches what is cached (idempotent).
     */
    suspend fun requestTranslation(messageId: String, targetLanguage: String): Boolean {
        val target = targetLanguage.trim()
        if (target.isEmpty()) return false
        val message = updater.find(messageId) ?: return false
        if (message.deletedAt != null) return false
        val source = message.content
        if (source.isBlank()) return false

        val translated = when (
            val result = apiCall {
                translationApi.translate(
                    TranslateRequest(
                        text = source,
                        sourceLanguage = message.originalLanguage?.trim().orEmpty(),
                        targetLanguage = target,
                    ),
                )
            }
        ) {
            is NetworkResult.Success -> result.data.translatedText
            is NetworkResult.Failure -> return false
        }
        if (translated.isBlank()) return false

        var stored = false
        updater.update(messageId, requireSynced = false) { current ->
            val merged = MessageTranslationMerge.mergeTranslation(current, target, translated)
            if (merged != null) {
                stored = true
                merged
            } else {
                current
            }
        }
        return stored
    }
}
