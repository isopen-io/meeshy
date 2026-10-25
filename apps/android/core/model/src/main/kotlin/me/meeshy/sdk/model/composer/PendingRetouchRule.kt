package me.meeshy.sdk.model.composer

/**
 * **QUELLE PIÈCE EN ATTENTE S'OUVRE DANS LA RETOUCHE** (#11133, #12735) — miroir de la porte iOS « toucher une
 * pièce l'ouvre dans la retouche de la caméra » : une image ou une vidéo prête, dont le fichier de travail est là.
 * Une pièce qui se prépare, un son ou un fichier ne s'ouvrent pas.
 */
public object PendingRetouchRule {
    public fun opens(item: PendingAttachment): Boolean =
        item.type in RETOUCHABLE && item.isReady && !item.localPath.isNullOrBlank()

    private val RETOUCHABLE = setOf(PendingAttachmentType.IMAGE, PendingAttachmentType.VIDEO)
}
