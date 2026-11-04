package me.meeshy.sdk.conversation

import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.AttachmentAudioTranslationMerge
import me.meeshy.sdk.model.StoredAudioTranslation
import me.meeshy.sdk.model.StoredTextTranslation
import me.meeshy.sdk.model.StoredTranscription
import me.meeshy.sdk.model.AttachmentTranscriptionMerge
import me.meeshy.sdk.model.MessageTranslationMerge
import me.meeshy.sdk.model.translation.ServerTranslationAdmission
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
    /** Les lignes dédiées (uniques par message et langue) : sans elles, la charge du message porte l'enrichissement. */
    private val layer: TranslationLayer? = null,
    private val clock: CacheClock? = null,
) {

    private fun now(): Long = clock?.nowMillis() ?: System.currentTimeMillis()


    /**
     * Applies a `message:translation` socket update to the
     * cache — the translated content is upserted into the message's translations so
     * the Prisme renders it live (progressive translation). A no-op merge (blank, duplicate,
     * or deleted target) leaves the cached row untouched.
     */
    suspend fun applyTranslation(messageId: String, targetLanguage: String, translatedContent: String) {
        if (layer != null) {
            persistTranslation(layer, updater.ticket(), messageId, targetLanguage, translatedContent)
            return
        }
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
        if (layer != null) {
            updater.enrich(updater.ticket(), messageId) { canonical, stored ->
                layer.ensureLoaded(listOf(canonical))
                val message = layer.project(LocalMessage(stored)).message
                val merged = AttachmentTranscriptionMerge.mergeTranscription(
                    message, attachmentId, text, language, confidence, durationMs,
                ) ?: return@enrich false
                val attachment = changedAttachment(message, merged) ?: return@enrich false
                val held = attachment.transcription ?: return@enrich false
                layer.saveTranscription(
                    canonical,
                    StoredTranscription(canonical, attachment.id, held.transcribedText ?: held.text.orEmpty(), held.language, held.confidence, held.durationMs),
                    now(),
                )
            }
            return
        }
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
        if (layer != null) {
            updater.enrich(updater.ticket(), messageId) { canonical, stored ->
                layer.ensureLoaded(listOf(canonical))
                val message = layer.project(LocalMessage(stored)).message
                val merged = AttachmentAudioTranslationMerge.mergeAudioTranslation(
                    message, attachmentId, language, url, transcription, durationMs, format, cloned, quality, voiceModelId, ttsModel,
                ) ?: return@enrich false
                val attachment = changedAttachment(message, merged) ?: return@enrich false
                val entry = attachment.translations.orEmpty().entries
                    .firstOrNull { it.key.equals(language.trim(), ignoreCase = true) }?.value ?: return@enrich false
                layer.saveAudio(
                    canonical,
                    StoredAudioTranslation(
                        canonical, attachment.id, language.trim(), entry.url.orEmpty(), entry.transcription.orEmpty(),
                        entry.durationMs, entry.format, entry.cloned == true, entry.quality, entry.voiceModelId, entry.ttsModel,
                    ),
                    now(),
                )
            }
            return
        }
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
        if (!ServerTranslationAdmission.admits(message, conversationEncryptionMode = null)) return false
        val source = message.content
        if (source.isBlank()) return false
        if (layer != null) {
            layer.ensureLoaded(listOf(message.id))
            val held = layer.project(LocalMessage(message)).message.translations
            if (held.any { it.targetLanguage.equals(target, ignoreCase = true) && it.translatedContent.isNotBlank() }) return false
        }

        val ticket = updater.ticket()
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

        if (layer != null) {
            var persisted = false
            updater.enrich(ticket, messageId) { canonical, current ->
                if (current.deletedAt != null) return@enrich false
                persisted = layer.saveText(
                    canonical,
                    StoredTextTranslation(canonical, target, translated, current.originalLanguage?.trim().orEmpty()),
                    now(),
                )
                persisted
            }
            return persisted
        }
        var stored = false
        updater.update(ticket, messageId, requireSynced = false) { current ->
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

    private suspend fun persistTranslation(
        layer: TranslationLayer,
        ticket: me.meeshy.sdk.session.AccountTicket?,
        messageId: String,
        targetLanguage: String,
        translatedContent: String,
    ) {
        updater.enrich(ticket, messageId) { canonical, message ->
            if (message.deletedAt != null) return@enrich false
            val language = targetLanguage.trim()
            if (language.isEmpty() || translatedContent.isBlank()) return@enrich false
            layer.saveText(
                canonical,
                StoredTextTranslation(canonical, language, translatedContent, message.originalLanguage?.trim().orEmpty()),
                now(),
            )
        }
    }

    private fun changedAttachment(before: ApiMessage, after: ApiMessage): ApiMessageAttachment? =
        after.attachments.zip(before.attachments).firstOrNull { (changed, held) -> changed != held }?.first
}
