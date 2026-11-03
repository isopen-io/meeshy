package me.meeshy.sdk.model

/**
 * **Quelles pièces REÇUES rejoignent seules la galerie** (#14642) — miroir de
 * `ReceivedMediaAutoSavePolicy` (iOS, #8307 / #10370).
 *
 * L'enregistrement automatique est une SORTIE : la loi de sortie décide ([MessageExitOffer] —
 * éphémère, flamme, vue unique, flou, lus sur le message ET sur ses pièces). S'y ajoutent le
 * chiffrement du message et la protection déclarée de la PIÈCE ([isProtected], fermée par
 * défaut). Seuls les messages reçus pendant l'installation en cours entrent : un message dont la
 * date SERVEUR précède l'installation (ou est illisible) n'y entre que par un « Enregistrer » exprès.
 */
public object ReceivedMediaAutoSavePolicy {

    public fun eligibleMedia(
        message: ApiMessage,
        currentUserId: String,
        installedAtMillis: Long,
    ): List<ApiMessageAttachment> {
        if (message.isFrom(currentUserId)) return emptyList()
        if (message.deletedAt != null) return emptyList()
        if (message.isEncrypted == true || !message.encryptionMode.isNullOrBlank()) return emptyList()
        val sentAt = WireDate.epochMillis(message.createdAt) ?: return emptyList()
        if (sentAt < installedAtMillis) return emptyList()
        if (!message.exitOffer().offers(MessageExit.SAVE)) return emptyList()
        return message.attachments.filter { attachment ->
            kind(attachment) != null && !attachment.isProtected && attachment.isEncrypted != true &&
                !attachment.fileUrl.isNullOrBlank()
        }
    }

    /** Image ou vidéo — les seuls médias qui rejoignent la galerie ; `null` pour tout le reste. */
    public fun kind(attachment: ApiMessageAttachment): MediaKind? =
        when (MediaKindClassifier.fromMimeType(attachment.mimeType)) {
            MediaKind.IMAGE -> MediaKind.IMAGE
            MediaKind.VIDEO -> MediaKind.VIDEO
            else -> null
        }

    private fun ApiMessage.isFrom(userId: String): Boolean =
        senderId == userId || sender?.id == userId || sender?.userId == userId
}
