package me.meeshy.sdk.model.composer

/**
 * Ce que vaut le champ APRÈS un envoi (miroir d'iOS `ComposerFieldAfterSend`) : la valeur dite par
 * CELUI QUI A ENVOYÉ, jamais devinée. Vider sans condition effacerait un texte refusé (lecture
 * seule, mode lent, contenu vide) ; laisser la copie locale ressusciterait un texte parti.
 */
public object ComposerFieldAfterSend {

    public enum class Sender {
        HOST,
        COMPOSER;

        public companion object {
            /** Un envoi fourni par l'hôte (la conversation) ⇒ l'hôte ; absent ⇒ la barre. */
            public fun of(hasCustomSend: Boolean): Sender = if (hasCustomSend) HOST else COMPOSER
        }
    }

    /** [local] : le texte de la barre après l'envoi ; [host] : la source de l'hôte après l'envoi, `null` sans hôte. */
    public fun resolve(local: String, host: String?, sender: Sender): String = when (sender) {
        Sender.HOST -> host ?: local
        Sender.COMPOSER -> local
    }
}

/** Quand l'hôte a vidé sa source, la copie locale s'aligne ; s'il a gardé le texte (refus), elle le garde (miroir d'iOS). */
public object ComposerSendAlignment {
    public fun shouldClearLocalText(hostText: String?, localText: String): Boolean {
        if (hostText == null) return false
        return hostText.isEmpty() && localText.isNotEmpty()
    }
}
