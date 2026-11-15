package me.meeshy.sdk.media

/**
 * **Un média perdu sur l'appareil** (#13554) : ses octets en file n'existent plus ou ne s'ouvrent plus — balayés, altérés, ou
 * scellés sous une clé tenue en mémoire seulement (Keystore inutilisable) et perdue au redémarrage. La même loi lue partout
 * où l'envoi échoue : la raison que la ligne d'envoi épuisée porte ([MediaUploadSender]) et que ses dépendants reçoivent en
 * cascade. Une telle perte est DÉFINITIVE : un nouvel essai échouerait à l'identique ; la seule issue est de retirer le
 * média et de le choisir de nouveau.
 */
public object MediaLoss {
    /** La raison qu'une ligne d'envoi, et chacun de ses dépendants, porte quand ses octets sont perdus. */
    public const val REASON: String = MediaUploadSender.REASON_BLOB_GONE

    public fun isReason(reason: String?): Boolean = reason == REASON
}
