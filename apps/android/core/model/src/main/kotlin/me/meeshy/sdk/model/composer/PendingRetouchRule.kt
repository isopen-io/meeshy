package me.meeshy.sdk.model.composer

/**
 * **QUELLE PIÈCE EN ATTENTE S'OUVRE DANS LA RETOUCHE** (#11133, #12735) — miroir de la porte iOS « toucher une
 * pièce l'ouvre dans la retouche de la caméra » : une image ou une vidéo prête, dont le fichier de travail est là.
 * Un son prêt s'ouvre dans l'éditeur audio plein écran (#13462, iOS `MeeshyAudioEditorView`). Une pièce qui se
 * prépare ou un fichier ne s'ouvrent pas.
 */
public object PendingRetouchRule {
    public fun opens(item: PendingAttachment): Boolean =
        item.type in RETOUCHABLE && item.isReady && !item.localPath.isNullOrBlank() && !isGif(item)

    /** `true` pour un son : il s'ouvre dans l'éditeur audio, pas dans la retouche de la caméra. */
    public fun opensAudioEditor(item: PendingAttachment): Boolean = opens(item) && item.type == PendingAttachmentType.AUDIO

    /** Un GIF ne s'offre pas à la retouche : la scène le rendrait en image fixe (iOS `offersRetouche`). */
    private fun isGif(item: PendingAttachment): Boolean =
        item.type == PendingAttachmentType.IMAGE && item.mimeType.equals("image/gif", ignoreCase = true)

    private val RETOUCHABLE = setOf(PendingAttachmentType.IMAGE, PendingAttachmentType.VIDEO, PendingAttachmentType.AUDIO)
}
