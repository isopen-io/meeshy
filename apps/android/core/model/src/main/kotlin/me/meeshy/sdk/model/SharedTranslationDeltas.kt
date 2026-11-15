package me.meeshy.sdk.model

import me.meeshy.sdk.lang.LanguageCodeNormalizer
import me.meeshy.sdk.model.translation.SharedTranslation
import me.meeshy.sdk.model.translation.SharedTranslationBinding
import me.meeshy.sdk.model.translation.SharedTranslationKeySource
import me.meeshy.sdk.model.translation.SharedTranslationSeal

/**
 * La traduction qu'un membre PARTAGE (`message:translation-shared`, #9899) rejoint les traductions du
 * message — miroir de `DeviceTranslationCoordinator.accept` (iOS). La passerelle ne l'ouvre pas : l'enveloppe
 * s'ouvre ICI, avec le texte du message que cet appareil a déjà, et seulement si elle est liée à CE message,
 * CETTE conversation, CETTE langue et CE texte.
 *
 * Le Prisme décide toujours de ce qui s'affiche : la traduction s'AJOUTE, la langue servie reste résolue par
 * `LanguageResolver`. Rien n'est ajouté pour un rang que le lecteur n'a pas, ou qu'un rang plus préféré (ou le
 * message lui-même) sert déjà ; une traduction déjà servie n'est jamais écrasée ; un message scellé de bout en
 * bout ou supprimé n'en reçoit aucune (fail-closed).
 */
object SharedTranslationDeltas {

    fun merge(message: ApiMessage, shared: SharedTranslation, readerLanguages: List<String>): ApiMessage {
        if (shared.messageId != message.id || shared.conversationId != message.conversationId) return message
        if (!message.readableByServer || message.content.isBlank()) return message
        val target = LanguageCodeNormalizer.normalizeForDedup(shared.targetLanguage)
        if (target !in wantedTargets(message, readerLanguages)) return message
        val inner = SharedTranslationSeal.open(
            binding = SharedTranslationBinding(message.conversationId, message.id, shared.targetLanguage, message.content),
            key = SharedTranslationKeySource.MessageContent,
            envelope = shared.envelope,
        ) ?: return message
        val entry = ApiTextTranslation(
            id = "shared:${shared.id}",
            messageId = message.id,
            sourceLanguage = inner.sourceLanguage,
            targetLanguage = shared.targetLanguage,
            translatedContent = inner.text,
            translationModel = inner.engine,
        )
        return message.copy(translations = message.translations + entry)
    }

    /**
     * Les rangs du Prisme qu'il reste à servir : la descente s'arrête au premier rang déjà servi, par une
     * traduction ou parce que le message est écrit dans cette langue (`DeviceTranslationTarget.candidates`, iOS).
     * Sans langue d'origine connue, rien n'est calculé.
     */
    private fun wantedTargets(message: ApiMessage, readerLanguages: List<String>): List<String> {
        val original = message.originalLanguage?.takeIf { it.isNotBlank() }
            ?.let(LanguageCodeNormalizer::normalizeForDedup) ?: return emptyList()
        val served = message.translations
            .filter { it.isEncrypted != true && it.translatedContent.isNotBlank() }
            .map { LanguageCodeNormalizer.normalizeForDedup(it.targetLanguage) }
            .toSet()
        val wanted = mutableListOf<String>()
        for (rank in readerLanguages.filter { it.isNotBlank() }) {
            val target = LanguageCodeNormalizer.normalizeForDedup(rank)
            if (target == original || target in served) break
            if (target !in wanted) wanted += target
        }
        return wanted
    }

    private val ApiMessage.readableByServer: Boolean
        get() = deletedAt == null && !isEndToEndSealed && isEncrypted != true && !EndToEndRegime.isEndToEnd(encryptionMode)
}
