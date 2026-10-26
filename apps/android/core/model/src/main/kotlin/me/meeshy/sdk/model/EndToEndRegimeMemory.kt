package me.meeshy.sdk.model

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Le registre, par compte, des conversations que cet appareil a vues chiffrées de bout en bout
 * (#12956) — la valeur pure ; la persistance vit dans `sdk-core` (`EndToEndRegimeLedger`).
 * Il ne recule jamais : le bout en bout est irréversible (#12949), et l'Android natif ne sait
 * ni chiffrer ni lire l'e2ee (#13015). Miroir de `apps/web/src/lib/end-to-end-regime-ledger.ts`.
 */
data class EndToEndSealedConversations(val ids: Set<String> = emptySet()) {

    fun isSealed(conversationId: String): Boolean = conversationId in ids

    fun learn(conversationId: String): EndToEndSealedConversations =
        if (conversationId.isBlank() || conversationId in ids) this else EndToEndSealedConversations(ids + conversationId)
}

/** Les lois du régime vu (#12956, #13099) : la rétrogradation ignorée et ce que le fil montre. */
object EndToEndRegimeMemory {

    private val SERVER_READABLE_MODES = setOf("server", "hybrid")

    /**
     * La conversation servie, son régime e2ee retenu quand cet appareil l'a déjà vue e2ee : une
     * passerelle compromise qui la servirait sans mode ne rouvre pas le clair.
     */
    fun kept(served: ApiConversation, seenEndToEnd: Boolean): ApiConversation =
        if (seenEndToEnd && !EndToEndRegime.isEndToEnd(served.encryptionMode)) {
            served.copy(encryptionMode = EndToEndRegime.MODE)
        } else {
            served
        }

    /** Le fil APPREND le bout en bout : l'avis d'activation partout, un message e2ee dans un tête-à-tête. */
    fun threadShowsEndToEnd(messages: List<ApiMessage>, isDirect: Boolean): Boolean =
        messages.any { announcesEndToEnd(it) || (isDirect && carriesEndToEnd(it)) }

    /**
     * Le fil RETIENT l'envoi en cours sans rien apprendre : un chiffré sans mode ou d'un mode
     * inconnu, partout ; un message e2ee dans un groupe. Miroir d'iOS
     * (`EncryptionSwitchNoticeTrail.ambiguousEncryptedMessageShown`).
     */
    fun threadHoldsSend(messages: List<ApiMessage>, isDirect: Boolean): Boolean =
        messages.any { ambiguouslyEncrypted(it) || (!isDirect && carriesEndToEnd(it)) }

    private fun isSystem(message: ApiMessage): Boolean =
        message.messageType == "system" || message.messageSource == "system"

    private fun carriesEndToEnd(message: ApiMessage): Boolean =
        message.deletedAt == null && !isSystem(message) && EndToEndRegime.isEndToEnd(message.encryptionMode)

    private fun ambiguouslyEncrypted(message: ApiMessage): Boolean {
        if (message.deletedAt != null || isSystem(message) || message.isEncrypted != true) return false
        val mode = message.encryptionMode?.trim()?.lowercase().orEmpty()
        return !EndToEndRegime.isEndToEnd(mode) && mode !in SERVER_READABLE_MODES
    }

    private fun announcesEndToEnd(message: ApiMessage): Boolean {
        if (message.messageType != "system") return false
        val metadata = message.metadata ?: return false
        val kind = (metadata["kind"] as? JsonPrimitive)?.contentOrNull
        val mode = (metadata["mode"] as? JsonPrimitive)?.contentOrNull
        return kind == "encryption-enabled" && EndToEndRegime.isEndToEnd(mode)
    }
}
