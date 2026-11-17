package me.meeshy.sdk.model.composer

/**
 * Ce que le composeur reprend quand un envoi chiffré de bout en bout n'a pas pu partir (#18975) : le texte et la réponse du
 * geste, que le composeur avait vidés à l'instant de l'envoi. Ce que l'utilisateur a écrit ou choisi PENDANT l'envoi est
 * plus récent : un échec ne l'écrase jamais (même loi que [SendPlaceTileLaw]). Rien n'est écrit sur le disque : le
 * brouillon d'un fil chiffré ne s'écrit jamais.
 */
public object EndToEndSendRestoration {

    /** `null` = rien à remettre à cette place. */
    public data class Restored(val text: String?, val replyToId: String?)

    public fun restoration(sentText: String, sentReplyToId: String?, currentText: String, currentReplyToId: String?): Restored =
        Restored(
            text = sentText.takeIf { it.isNotBlank() && currentText.isBlank() },
            replyToId = sentReplyToId.takeIf { currentReplyToId == null },
        )
}
