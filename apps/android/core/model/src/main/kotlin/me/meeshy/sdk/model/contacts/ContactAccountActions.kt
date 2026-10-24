package me.meeshy.sdk.model.contacts

/**
 * La relation du lecteur avec un compte résolu (miroir de `ContactRelation`, iOS). Une valeur
 * inconnue du fil se lit [None], jamais une erreur de décodage.
 */
enum class ContactRelation(val wire: String) {
    Self("self"),
    Friend("friend"),
    RequestSent("request-sent"),
    RequestReceived("request-received"),
    None("none"),
    ;

    companion object {
        fun fromWire(raw: String?): ContactRelation = entries.firstOrNull { it.wire == raw } ?: None
    }
}

/** L'état d'amitié offert à côté d'« Écrire » : un bouton plein, ou un ÉTAT sans geste. */
enum class ContactConnectAction { Connect, Pending, Received }

/**
 * Les actions offertes sur une personne selon la relation (miroir de `ContactAccountActions`,
 * iOS) : soi = aucune ; ami = Écrire ; demande envoyée / reçue = un état + Écrire ; aucune
 * relation = Se connecter (plein) + Écrire (contour). Table unique du répertoire, des affiliés,
 * du clavier, de Découvrir et de la carte de visite.
 */
data class ContactAccountActions(
    val connect: ContactConnectAction?,
    val canWrite: Boolean,
) {
    companion object {
        val NONE = ContactAccountActions(connect = null, canWrite = false)

        fun resolve(relation: ContactRelation): ContactAccountActions = when (relation) {
            ContactRelation.Self -> NONE
            ContactRelation.Friend -> ContactAccountActions(null, canWrite = true)
            ContactRelation.RequestSent -> ContactAccountActions(ContactConnectAction.Pending, canWrite = true)
            ContactRelation.RequestReceived -> ContactAccountActions(ContactConnectAction.Received, canWrite = true)
            ContactRelation.None -> ContactAccountActions(ContactConnectAction.Connect, canWrite = true)
        }
    }
}
