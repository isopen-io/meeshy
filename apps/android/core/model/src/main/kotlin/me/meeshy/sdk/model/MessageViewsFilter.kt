package me.meeshy.sdk.model

/**
 * Les onglets de la fiche « Vu par » — miroir de `MessageViewsFilter.swift`.
 * Les quatre premiers sont des statuts TEXTE ; les trois derniers montrent une
 * famille de consommation de média.
 */
enum class MessageViewsFilter(val isMediaFamily: Boolean) {
    Sent(false),
    Delivered(false),
    Read(false),
    NotSeen(false),
    Listened(true),
    Watched(true),
    Opened(true);

    companion object {
        /**
         * L'onglet le plus avancé qui a au moins une personne à montrer : un
         * lecteur ⇒ « Lu », sinon un destinataire servi ⇒ « Distribué », sinon
         * « Envoyé ». Qui cache ses accusés ne voit « Lu » nulle part.
         */
        fun initial(readCount: Int, deliveredCount: Int, showReadReceipts: Boolean): MessageViewsFilter =
            when {
                showReadReceipts && readCount > 0 -> Read
                deliveredCount > 0 || readCount > 0 -> Delivered
                else -> Sent
            }
    }
}
