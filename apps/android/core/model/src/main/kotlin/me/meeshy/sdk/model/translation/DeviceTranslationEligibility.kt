package me.meeshy.sdk.model.translation

import java.util.Base64
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.isProtected

/**
 * Ce que l'appareil fait d'un message du fil.
 *
 * Miroir de `DeviceTranslationDisposition` (iOS, `DeviceTranslationEligibility.swift`).
 */
public enum class DeviceTranslationDisposition {
    /** L'appareil ne s'en charge pas. */
    Skip,

    /**
     * Le serveur ne lit pas ce message (bout en bout, mode inconnu, message chiffré
     * sans mode) : traduit et montré, jamais écrit sur le disque, jamais partagé.
     */
    Ephemeral,

    /** Traduit, montré, gardé comme une traduction du serveur, puis scellé et partagé. */
    Shareable,
}

/**
 * Ce que le fil confie à l'appareil (#9899). Miroir de `DeviceTranslationEligibility` (iOS) et de
 * `sharedTranslationServerReadsMessage` (`packages/shared/utils/shared-translation-eligibility.ts`,
 * le TypeScript fait foi) : toute évolution de la règle touche les trois.
 */
public object DeviceTranslationEligibility {

    /** `conversationEncryptionMode` : `null`, `"server"`, `"hybrid"`, `"e2ee"`. */
    public fun disposition(
        message: ApiMessage,
        viewerUserId: String?,
        conversationEncryptionMode: String?,
    ): DeviceTranslationDisposition {
        if (!isOffered(message, viewerUserId)) return DeviceTranslationDisposition.Skip
        if (!isEndToEnd(message, conversationEncryptionMode)) return DeviceTranslationDisposition.Shareable
        return if (looksLikeCiphertext(message.content)) {
            DeviceTranslationDisposition.Skip
        } else {
            DeviceTranslationDisposition.Ephemeral
        }
    }

    /**
     * Mes propres messages sont écrits dans une langue que je lis. Un message éphémère, à vue
     * unique ou flouté (message ou pièce) n'entre jamais dans le cache de l'appareil : sa
     * traduction y survivrait à la protection. Un avis système, un message supprimé, sans texte
     * ou sans langue d'origine connue n'ont rien à traduire.
     */
    public fun isOffered(message: ApiMessage, viewerUserId: String?): Boolean {
        val mine = viewerUserId != null && message.senderId == viewerUserId
        return !mine &&
            (message.messageSource == null || message.messageSource == "user") &&
            message.deletedAt == null &&
            message.isViewOnce != true &&
            message.isBlurred != true &&
            !message.effects.hasLifecycleEffect &&
            message.expiresAt.isNullOrBlank() &&
            (message.ephemeralDuration ?: 0) == 0 &&
            (message.effects.ephemeralDuration ?: 0) == 0 &&
            message.attachments.none { it.isProtected } &&
            message.content.isNotBlank() &&
            !message.originalLanguage.isNullOrBlank()
    }

    /**
     * Le serveur lit-il déjà le texte de ce message ? Seuls un message en clair et un message
     * chiffré PAR le serveur (`server`, `hybrid`) le lui donnent. Tout le reste — bout en bout,
     * mode inconnu, message chiffré sans mode — se lit comme un message qu'il ne lit pas
     * (fail-closed). Les modes se comparent sans blancs ni casse.
     */
    public fun serverReadsMessage(
        conversationEncryptionMode: String?,
        isEncrypted: Boolean?,
        encryptionMode: String?,
    ): Boolean {
        val conversation = normalizedMode(conversationEncryptionMode)
        if (conversation.isNotEmpty() && conversation !in SERVER_READABLE_MODES) return false
        val message = normalizedMode(encryptionMode)
        if (message.isEmpty()) return isEncrypted != true
        return message in SERVER_READABLE_MODES
    }

    public fun isEndToEnd(message: ApiMessage, conversationEncryptionMode: String?): Boolean =
        !serverReadsMessage(conversationEncryptionMode, message.isEncrypted, message.encryptionMode)

    /**
     * Un message de bout en bout est persisté chiffré : tant qu'il n'est pas déchiffré, son
     * contenu est l'enveloppe en base64, que traduire ne rendrait qu'un charabia.
     */
    public fun looksLikeCiphertext(content: String): Boolean {
        if (content.toByteArray(Charsets.UTF_8).size < SharedTranslationLimits.PAYLOAD_MIN_LENGTH) return false
        if (content.any { it.isWhitespace() }) return false
        return runCatching { Base64.getDecoder().decode(content) }.isSuccess
    }

    private val SERVER_READABLE_MODES: Set<String> = setOf("server", "hybrid")

    private fun normalizedMode(mode: String?): String = (mode ?: "").trim().lowercase()
}
