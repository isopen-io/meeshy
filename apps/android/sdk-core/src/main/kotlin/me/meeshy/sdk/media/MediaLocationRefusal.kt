package me.meeshy.sdk.media

/**
 * **Un média refusé parce que son lieu ne peut pas être retiré** (#13550, #13543) : la même loi lue partout où l'envoi échoue —
 * le code d'erreur rendu par [OutgoingMediaSanitizer] (envoi direct depuis un composeur), la raison qu'une ligne d'envoi
 * épuisée porte dans la file ([MediaUploadSender]), et celle que ses dépendants reçoivent en cascade. Un tel refus est
 * DÉFINITIF : les mêmes octets seraient refusés à chaque nouvel essai ; la seule issue est de retirer la pièce, ou d'en choisir
 * une autre.
 */
public object MediaLocationRefusal {
    /** La raison qu'une ligne d'envoi, et chacun de ses dépendants, porte quand le lieu de son média ne part pas. */
    public const val REASON: String = MediaUploadSender.REASON_LOCATION_NOT_REMOVABLE

    /** Un code d'erreur d'envoi direct qui dit « le lieu de ce média (photo, vidéo, son, fichier) ne peut pas être retiré ». */
    public fun isCode(code: String?): Boolean =
        code == OutgoingMediaSanitizer.REFUSED_CODE || code == OutgoingMediaSanitizer.MEDIA_REFUSED_CODE

    /** Une raison d'échec, en file, qui dit la même chose. */
    public fun isReason(reason: String?): Boolean = reason == REASON
}
