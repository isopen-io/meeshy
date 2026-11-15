package me.meeshy.sdk.model.conversationlist

/**
 * Pourquoi la passerelle a refusé « Rendre obsolète » (#14690). Dans un tête-à-tête, tant qu'une demande de
 * message n'est pas acceptée, seul son DESTINATAIRE rend la directe obsolète : l'expéditeur reçoit 403 (#14676).
 * La passerelle ne sert jamais à l'expéditeur l'état de sa demande, donc la loi de la rangée lui offre l'action ;
 * le 403 d'une directe que cette loi ouvrait ne peut venir que de là, et l'écran le dit en clair.
 */
enum class ObsoleteRefusal {
    PENDING_REQUEST,
    OTHER,
    ;

    companion object {
        private const val FORBIDDEN = 403

        fun of(isDirect: Boolean, httpStatus: Int?): ObsoleteRefusal =
            if (isDirect && httpStatus == FORBIDDEN) PENDING_REQUEST else OTHER
    }
}
