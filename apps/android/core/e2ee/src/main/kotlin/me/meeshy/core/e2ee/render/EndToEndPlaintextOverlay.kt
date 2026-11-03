package me.meeshy.core.e2ee.render

import me.meeshy.core.e2ee.E2eeWire
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.store.E2eePlaintextEntry
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * **Le clair d'un message chiffré de bout en bout ne s'écrit que dans le coffre E2EE** (miroir de
 * `EndToEndDiskPlaintextLaw`, iOS, #12999) : Room ne garde que le littéral `[Encrypted]`, et le fil relit le clair au
 * coffre, EN MÉMOIRE, au moment de l'afficher. C'est cette projection.
 *
 * **Le clair n'est adopté que s'il est à SA place** (miroir de `EndToEndThreadPlaintexts.isInPlace`, iOS, #12916,
 * #14631) : même conversation que le fil, parole d'un membre, auteur annoncé égal à l'auteur que libsignal a
 * authentifié, mêmes identifiant client et message cité. La clé client (`cid_`) ne se lit que pour MES messages : elle
 * voyage dans ma requête, un serveur compromis pourrait la reprendre pour ranger mon texte sous un autre message.
 *
 * Un message ouvert garde `encryptionMode = "e2ee"` : toutes les gardes qui lisent le régime (traduction serveur,
 * transfert, gestes en clair) continuent de le traiter comme chiffré de bout en bout. Seul `isEncrypted` tombe, pour que
 * la bulle rende le texte au lieu du sceau. Un message que l'appareil n'a pas pu ouvrir, ou qui n'est pas à sa place,
 * reste scellé.
 */
public object EndToEndPlaintextOverlay {

    /** Le message d'un fil e2ee dont le coffre peut tenir le clair : chiffré, mode e2ee ou littéral servi. */
    public fun isCandidate(message: ApiMessage): Boolean =
        message.isEncrypted == true && (EndToEndRegime.isEndToEnd(message.encryptionMode) || message.content == E2eeWire.CONTENT_PLACEHOLDER)

    /** Les identifiants sous lesquels le coffre peut ranger ce message : l'id servi, puis l'id client de MES messages. */
    public fun keysOf(message: ApiMessage, readerUserId: String): List<String> =
        listOfNotNull(message.id, message.clientMessageId?.takeIf { isMine(message, readerUserId) }).distinct()

    public fun apply(
        message: ApiMessage,
        entries: Map<String, E2eePlaintextEntry>,
        conversationId: String,
        readerUserId: String,
    ): ApiMessage {
        if (!isCandidate(message) || message.deletedAt != null) return message
        val readable = keysOf(message, readerUserId).firstNotNullOfOrNull { entries[it] } as? E2eePlaintextEntry.Readable ?: return message
        if (!isInPlace(readable.content, readable.senderUserId, message, conversationId)) return message
        val text = readable.content.text ?: return message
        return message.copy(
            content = text,
            originalLanguage = readable.content.language ?: message.originalLanguage,
            isEncrypted = false,
            encryptionMode = E2eeWire.MODE,
        )
    }

    /**
     * Les clés à retirer du coffre pour un message échu ou vu une fois (#14633) : son clair n'a plus rien à faire sur
     * l'appareil. Vide pour un message vivant, et pour une pierre tombale (#14656) : celle d'une suppression lancée ici
     * peut encore être refusée par le serveur, et le coffre est la seule copie du clair. Une suppression CONFIRMÉE passe
     * par la file durable `e2ee_plaintext_erasures`, comme sur iOS (`markDeletedAwaitingConfirmation`).
     */
    public fun erasableKeys(message: ApiMessage, readerUserId: String, nowMillis: Long): List<String> =
        if (isEndToEnd(message) && isGone(message, nowMillis)) keysOf(message, readerUserId) else emptyList()

    private fun isEndToEnd(message: ApiMessage): Boolean =
        message.isEncrypted == true || EndToEndRegime.isEndToEnd(message.encryptionMode)

    private fun isGone(message: ApiMessage, nowMillis: Long): Boolean =
        isoToEpochMillisOrNull(message.expiresAt)?.let { it <= nowMillis } == true ||
            (message.consumedByMe == true && message.effects.has(MessageEffectFlags.VIEW_ONCE))

    private fun isInPlace(content: E2eeContent, senderUserId: String, message: ApiMessage, conversationId: String): Boolean {
        val author = announcedAuthor(message) ?: return false
        if (message.conversationId != conversationId || !content.belongsTo(conversationId)) return false
        if (!isUserSpeech(message) || author != senderUserId) return false
        val written = content.clientMessageId
        val served = message.clientMessageId
        if (written != null && served != null && written != served) return false
        return cited(content.replyTo) == cited(message.replyToId)
    }

    private fun isMine(message: ApiMessage, readerUserId: String): Boolean =
        readerUserId.isNotEmpty() && announcedAuthor(message) == readerUserId

    /** L'auteur que le message ANNONCE : l'utilisateur de l'expéditeur, sinon `senderId`. Sans auteur, aucun clair. */
    private fun announcedAuthor(message: ApiMessage): String? =
        (message.sender?.resolvedUserId ?: message.senderId)?.takeIf { it.isNotEmpty() }

    private fun isUserSpeech(message: ApiMessage): Boolean = message.messageSource == null || message.messageSource == "user"

    private fun cited(id: String?): String? = id?.takeIf { it.isNotEmpty() }
}
