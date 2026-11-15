package me.meeshy.sdk.model

/**
 * **Le SECOND verrou des sorties d'un message** (#9573) — miroir de `MessageExitTransport` (iOS).
 *
 * Le premier verrou est le rendu : une entrée que [MessageExitOffer] n'offre pas n'est pas montée.
 * Celui-ci tient le GESTE : un gestionnaire appelé par une autre porte (feuille restée ouverte
 * pendant que le message change de nature, hôte qui oublie de filtrer) ne fait rien. Les sites qui
 * exécutent une sortie passent par ici au lieu d'écrire dans le presse-papiers eux-mêmes.
 */
object MessageExitTransport {

    /** Remet [text] au [sink] si l'offre laisse copier ; sinon ne touche à rien. Rend `true` si le texte est parti. */
    fun copy(text: String, offer: MessageExitOffer, sink: (String) -> Unit): Boolean {
        if (text.isEmpty() || !offer.offers(MessageExit.COPY)) return false
        sink(text)
        return true
    }

    /** Le message peut-il partir dans la feuille de partage système ? */
    fun mayShare(offer: MessageExitOffer): Boolean = offer.offers(MessageExit.SHARE)

    /** Partage [text] par [sink] si l'offre laisse partager. */
    fun share(text: String, offer: MessageExitOffer, sink: (String) -> Unit): Boolean {
        if (text.isEmpty() || !mayShare(offer)) return false
        sink(text)
        return true
    }
}
