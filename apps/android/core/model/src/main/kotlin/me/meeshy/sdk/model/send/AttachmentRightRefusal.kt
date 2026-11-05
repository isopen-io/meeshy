package me.meeshy.sdk.model.send

/**
 * **Le participant n'a pas le droit de joindre CE type de pièce** (#16053) : la passerelle sert `code: ATTACHMENT_RIGHT_NOT_PERMITTED`
 * (`attachmentKindAdmission.ts`) sur le 403 du POST REST comme sur l'acquittement de `message:send-with-attachments`. Miroir de
 * `AttachmentRightRefusal` (iOS, ab38cdc186) et de `send.failure.attachmentRight` (web, 32285d74f1).
 *
 * Le refus est DÉFINITIF pour cet envoi : ni repli socket, ni rejeu de la file — le même corps rencontrerait le même droit. La bulle
 * passe en échec et le DIT ; le renvoi reste un geste de l'auteur, car le droit peut venir (« pas encore »).
 *
 * Seul un refus SERVI compte : le code vient de l'enveloppe `success:false` de la passerelle, jamais d'une page de proxy (dont le
 * code synthétique est `HTTP_<n>`).
 */
object AttachmentRightRefusal {
    const val CODE: String = "ATTACHMENT_RIGHT_NOT_PERMITTED"

    fun isCode(code: String?): Boolean = code == CODE

    /** La raison d'un envoi épuisé (`Refused: HTTP 403 ATTACHMENT_RIGHT_NOT_PERMITTED`, `Refused: ATTACHMENT_RIGHT_NOT_PERMITTED`) : le code, mot entier. */
    fun isReason(reason: String?): Boolean = reason?.split(' ')?.any(::isCode) == true
}
