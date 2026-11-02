package me.meeshy.sdk.model.mediahub

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MessageExit
import me.meeshy.sdk.model.MessageExitOffer
import me.meeshy.sdk.model.deeplink.ConversationLinkTarget
import me.meeshy.sdk.model.exitOffer

/** La carte qu'une rangée du hub rend — la même que le fil pour le même genre (iOS `ConversationMediaHubRules.rendering`). */
enum class MediaHubRendering {
    /** Un vocal ou un son : lu DANS la rangée, par le lecteur du fil. */
    AUDIO,

    /** Une vidéo : lue par le lecteur intégré, jamais par l'application système. */
    VIDEO,

    /** Une image : la visionneuse. */
    IMAGE,

    /** Une carte de contact (vCard). */
    CONTACT_CARD,

    /** Tout autre fichier : le circuit de téléchargement du fil. */
    DOCUMENT,

    /** Une adresse web : la carte de lien du fil. */
    WEB_LINK,

    /** Une adresse de conversation Meeshy : sa carte. */
    CONVERSATION_LINK,

    PLACE,
}

/**
 * Ce que le hub laisse SORTIR d'une rangée — le portillon de SON porteur (#9573, #9574), miroir de
 * `contentExitGate(carrier.exitGate)` / `captureShield(carrier.exitOffer.capture…)` (iOS). Porteur
 * INCONNU ⇒ FERMÉ : rien ne sort, la couche sécurisée s'applique.
 */
data class MediaHubRowExit(private val offer: MessageExitOffer?) {

    /** Ouvrir dans une autre application, enregistrer ou partager : les deux sorties que la loi doit offrir. */
    val mayLeave: Boolean
        get() = offer != null && offer.offers(MessageExit.SAVE) && offer.offers(MessageExit.SHARE)

    /** La rangée (vignette, nom, transcription) se rend dans la couche sécurisée. */
    val shieldsCapture: Boolean get() = offer?.capture?.shieldsCapture() ?: true

    companion object {
        val Sealed = MediaHubRowExit(null)

        fun of(carrier: ApiMessage?, conversationIsEncrypted: Boolean): MediaHubRowExit =
            if (carrier == null) Sealed else MediaHubRowExit(carrier.exitOffer(conversationIsEncrypted))
    }
}

object MediaHubRowRules {

    fun rendering(item: MediaHubItem, webOrigin: String): MediaHubRendering = when (val payload = item.payload) {
        is MediaHubPayload.Place -> MediaHubRendering.PLACE
        is MediaHubPayload.Link ->
            if (ConversationLinkTarget.target(payload.url, webOrigin) != null) MediaHubRendering.CONVERSATION_LINK
            else MediaHubRendering.WEB_LINK
        is MediaHubPayload.Attachment -> when {
            payload.attachment.isEncrypted -> MediaHubRendering.DOCUMENT
            item.kind == ConversationMediaKind.AUDIO -> MediaHubRendering.AUDIO
            item.kind == ConversationMediaKind.CONTACT -> MediaHubRendering.CONTACT_CARD
            item.kind == ConversationMediaKind.VISUAL && payload.attachment.isVideo -> MediaHubRendering.VIDEO
            item.kind == ConversationMediaKind.VISUAL -> MediaHubRendering.IMAGE
            else -> MediaHubRendering.DOCUMENT
        }
    }

    /** Le nom d'une carte de contact : le fichier sans son extension (`Ada Lovelace.vcf` → « Ada Lovelace »). */
    fun contactName(fileName: String): String =
        fileName.trim().substringBeforeLast('.', fileName.trim()).ifBlank { fileName.trim() }
}
