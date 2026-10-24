package me.meeshy.sdk.model.auth

/** Ce que le bouton œil PROPOSE : l'action, pas l'état — « Afficher » tant que c'est masqué. */
enum class PasswordRevealAction {
    SHOW,
    HIDE,
}

/** Ce que l'écran MONTRE, annoncé par le lecteur d'écran comme l'état du champ. */
enum class PasswordRevealState {
    MASKED,
    REVEALED,
}

/**
 * La loi de la bascule œil d'un champ de mot de passe (iOS `MeeshyPasswordReveal`, #8054) :
 * masqué par défaut, un geste pour afficher, un geste pour masquer.
 *
 * Le lecteur d'écran lit l'ACTION dans le libellé du bouton ([action]) et l'ÉTAT dans sa
 * description d'état ([state]) : deux informations, deux champs — un libellé qui changerait
 * pour dire l'état ferait croire à une autre commande.
 *
 * Immuable : chaque bascule rend un état neuf.
 */
data class PasswordReveal(val isRevealed: Boolean = false) {

    fun toggled(): PasswordReveal = copy(isRevealed = !isRevealed)

    val action: PasswordRevealAction
        get() = if (isRevealed) PasswordRevealAction.HIDE else PasswordRevealAction.SHOW

    val state: PasswordRevealState
        get() = if (isRevealed) PasswordRevealState.REVEALED else PasswordRevealState.MASKED
}
