package me.meeshy.core.e2ee.render

import me.meeshy.core.e2ee.E2eeWire
import me.meeshy.core.e2ee.store.E2eePlaintextEntry
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.EndToEndRegime

/**
 * **Le clair d'un message chiffré de bout en bout ne s'écrit que dans le coffre E2EE** (miroir de
 * `EndToEndDiskPlaintextLaw`, iOS, #12999) : Room ne garde que le littéral `[Encrypted]`, et le fil relit le clair au
 * coffre, EN MÉMOIRE, au moment de l'afficher. C'est cette projection.
 *
 * Un message ouvert garde `encryptionMode = "e2ee"` : toutes les gardes qui lisent le régime (traduction serveur,
 * transfert, gestes en clair) continuent de le traiter comme chiffré de bout en bout. Seul `isEncrypted` tombe, pour que
 * la bulle rende le texte au lieu du sceau. Un message que l'appareil n'a pas pu ouvrir reste scellé.
 */
public object EndToEndPlaintextOverlay {

    /** Le message d'un fil e2ee dont le coffre peut tenir le clair : chiffré, mode e2ee ou littéral servi. */
    public fun isCandidate(message: ApiMessage): Boolean =
        message.isEncrypted == true && (EndToEndRegime.isEndToEnd(message.encryptionMode) || message.content == E2eeWire.CONTENT_PLACEHOLDER)

    /** Les identifiants sous lesquels le coffre peut ranger ce message : l'id servi, puis l'id client (mes envois). */
    public fun keysOf(message: ApiMessage): List<String> = listOfNotNull(message.id, message.clientMessageId).distinct()

    public fun apply(message: ApiMessage, entries: Map<String, E2eePlaintextEntry>): ApiMessage {
        if (!isCandidate(message)) return message
        val readable = keysOf(message).firstNotNullOfOrNull { entries[it] as? E2eePlaintextEntry.Readable } ?: return message
        val text = readable.content.text ?: return message
        return message.copy(
            content = text,
            originalLanguage = readable.content.language ?: message.originalLanguage,
            isEncrypted = false,
            encryptionMode = E2eeWire.MODE,
        )
    }
}
