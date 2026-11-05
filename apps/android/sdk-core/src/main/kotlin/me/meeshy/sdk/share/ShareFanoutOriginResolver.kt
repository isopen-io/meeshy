package me.meeshy.sdk.share

/** Ce que l'on sait de l'origine d'une ligne de fan-out de partage au moment où elle part. */
public sealed interface FanoutResolution {
    /** Envoi ordinaire : la ligne ne participe à aucun fan-out. */
    public data object NotAFanout : FanoutResolution

    /** L'origine est acquittée : le message peut réclamer la copie de ses pièces. */
    public data class Ready(val serverMessageId: String) : FanoutResolution

    /** L'origine n'est pas acquittée : partir livrerait un message VIDE de pièces, la ligne attend. */
    public data class WaitingForOrigin(val clientMessageId: String) : FanoutResolution
}

/**
 * **Décide si une ligne de fan-out peut partir** (miroir de `ShareFanoutOriginResolver`, iOS). Pure : la lecture du pont
 * `cid -> id serveur` reste chez l'appelant.
 */
public object ShareFanoutOriginResolver {
    public fun resolve(copyAttachmentsFromClientMessageId: String?, resolvedServerId: String?): FanoutResolution {
        val origin = copyAttachmentsFromClientMessageId?.takeIf { it.isNotEmpty() } ?: return FanoutResolution.NotAFanout
        val serverId = resolvedServerId?.takeIf { it.isNotEmpty() } ?: return FanoutResolution.WaitingForOrigin(origin)
        return FanoutResolution.Ready(serverId)
    }
}
