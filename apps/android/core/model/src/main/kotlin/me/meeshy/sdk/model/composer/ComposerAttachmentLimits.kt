package me.meeshy.sdk.model.composer

/** Plafonds du plateau de pièces en attente — miroir des bornes du composer iOS. */
object ComposerAttachmentLimits {

    /** Nombre maximal de médias en attente dans un même plateau (la 200e est refusée). */
    const val MAX_PENDING_ATTACHMENTS: Int = 199
}
